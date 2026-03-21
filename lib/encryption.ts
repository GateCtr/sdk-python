import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY ?? "";
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes)",
    );
  }
  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns: "iv:authTag:ciphertext" (all hex, colon-separated)
 * - IV: 16 random bytes
 * - Auth tag: 16 bytes (GCM default)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 16 bytes by default

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a string produced by `encrypt`.
 * Accepts: "iv:authTag:ciphertext" (all hex, colon-separated)
 * Throws: Error("decryption_failed") on tampered or invalid data
 */
export function decrypt(ciphertext: string): string {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) {
      throw new Error("invalid_format");
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");

    if (iv.length !== 16 || authTag.length !== 16) {
      throw new Error("invalid_lengths");
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  } catch {
    throw new Error("decryption_failed");
  }
}
