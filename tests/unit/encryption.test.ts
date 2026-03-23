// Feature: api-logic-completion, Property 14: Integration config encryption round-trip
import { describe, it, expect, beforeAll } from "vitest";
import * as fc from "fast-check";

// Provide a valid 64-char hex ENCRYPTION_KEY for tests
beforeAll(() => {
  process.env.ENCRYPTION_KEY = "a".repeat(64);
});

import { encrypt, decrypt } from "@/lib/encryption";

describe("Property 14: Integration config encryption round-trip", () => {
  it("decrypt(encrypt(plaintext)) === plaintext for any string", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 500 }), (plaintext) => {
        const ciphertext = encrypt(plaintext);
        const recovered = decrypt(ciphertext);
        expect(recovered).toBe(plaintext);
      }),
      { numRuns: 100 },
    );
  });

  it("encrypt produces iv:authTag:ciphertext format", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 200 }), (plaintext) => {
        const ciphertext = encrypt(plaintext);
        const parts = ciphertext.split(":");
        expect(parts).toHaveLength(3);
        // iv = 16 bytes = 32 hex chars
        expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
        // authTag = 16 bytes = 32 hex chars
        expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
      }),
      { numRuns: 100 },
    );
  });

  it("each encrypt call produces a unique ciphertext (random IV)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (plaintext) => {
        const c1 = encrypt(plaintext);
        const c2 = encrypt(plaintext);
        // Same plaintext → different ciphertext due to random IV
        expect(c1).not.toBe(c2);
        // But both decrypt to the same value
        expect(decrypt(c1)).toBe(plaintext);
        expect(decrypt(c2)).toBe(plaintext);
      }),
      { numRuns: 100 },
    );
  });

  it("decrypt throws on tampered ciphertext", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (plaintext) => {
        const ciphertext = encrypt(plaintext);
        // Corrupt the auth tag (middle segment) by flipping its first byte
        const parts = ciphertext.split(":");
        const tagHex = parts[1];
        const flipped = ((parseInt(tagHex.slice(0, 2), 16) ^ 0xff) >>> 0)
          .toString(16)
          .padStart(2, "0");
        const tampered = `${parts[0]}:${flipped}${tagHex.slice(2)}:${parts[2]}`;
        expect(() => decrypt(tampered)).toThrow("decryption_failed");
      }),
      { numRuns: 100 },
    );
  });

  it("round-trips JSON.stringify(config) as used by integrations route", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string()),
        (config) => {
          const serialized = JSON.stringify(config);
          const ciphertext = encrypt(serialized);
          const recovered = decrypt(ciphertext);
          expect(recovered).toBe(serialized);
          expect(JSON.parse(recovered)).toEqual(config);
        },
      ),
      { numRuns: 100 },
    );
  });
});
