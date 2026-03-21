import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { encrypt, decrypt } from "@/lib/encryption";

// Set a valid 32-byte hex ENCRYPTION_KEY for tests
beforeAll(() => {
  process.env.ENCRYPTION_KEY = "a".repeat(64);
});

describe("lib/encryption", () => {
  // Feature: core-api-budget-firewall, Property 5: Encryption Round-Trip
  // decrypt(encrypt(P)) == P for all string inputs including Unicode
  // Validates: Requirements 4.1, 4.8
  it("Property 5: decrypt(encrypt(P)) == P for arbitrary plaintext strings", () => {
    fc.assert(
      fc.property(fc.string(), (plaintext) => {
        const ciphertext = encrypt(plaintext);
        const decrypted = decrypt(ciphertext);
        expect(decrypted).toBe(plaintext);
      }),
    );
  });

  // Feature: core-api-budget-firewall, Property 6: LLM Provider Key Encryption Round-Trip
  // Validates: Requirements 4.1, 4.8
  it("Property 6: round-trip holds for LLM provider key-like strings (alphanumeric, special chars)", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-zA-Z0-9\-_\.]{10,100}$/), (apiKey) => {
        const ciphertext = encrypt(apiKey);
        const decrypted = decrypt(ciphertext);
        expect(decrypted).toBe(apiKey);
      }),
    );
  });

  it("produces colon-separated hex format (iv:authTag:ciphertext)", () => {
    const ciphertext = encrypt("test-key");
    const parts = ciphertext.split(":");
    expect(parts).toHaveLength(3);
    // IV: 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(32);
    // Auth tag: 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext: non-empty hex
    expect(parts[2].length).toBeGreaterThan(0);
    // All parts are valid hex
    expect(parts[0]).toMatch(/^[0-9a-f]+$/);
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encrypt("same-plaintext");
    const b = encrypt("same-plaintext");
    expect(a).not.toBe(b);
  });

  it("throws decryption_failed on tampered ciphertext", () => {
    const ciphertext = encrypt("sensitive-api-key");
    const parts = ciphertext.split(":");
    // Tamper the ciphertext portion
    const tampered = `${parts[0]}:${parts[1]}:${"ff".repeat(parts[2].length / 2)}`;
    expect(() => decrypt(tampered)).toThrow("decryption_failed");
  });

  it("throws decryption_failed on tampered auth tag", () => {
    const ciphertext = encrypt("sensitive-api-key");
    const parts = ciphertext.split(":");
    // Tamper the auth tag
    const tampered = `${parts[0]}:${"00".repeat(16)}:${parts[2]}`;
    expect(() => decrypt(tampered)).toThrow("decryption_failed");
  });

  it("throws decryption_failed on invalid format (not 3 parts)", () => {
    expect(() => decrypt("notvalidformat")).toThrow("decryption_failed");
    expect(() => decrypt("only:two")).toThrow("decryption_failed");
  });

  it("throws decryption_failed on empty string", () => {
    expect(() => decrypt("")).toThrow("decryption_failed");
  });
});
