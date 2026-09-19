import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * Encrypts sensitive credentials (the per-client WhatsApp access token)
 * before they're stored in the database. Never stores or logs plain text.
 *
 * CREDENTIALS_ENCRYPTION_KEY in .env can be any string — it's hashed to a
 * proper 32-byte key here, so you don't need to generate one in a special
 * format. Losing/changing this key makes previously-encrypted tokens
 * undecryptable (the client would need to reconnect WhatsApp).
 */
function getKey(): Buffer {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is not set in .env — required to store WhatsApp credentials securely."
    );
  }
  return createHash("sha256").update(secret).digest();
}

/** Returns "iv:authTag:ciphertext", all base64 — safe to store in a single
 * text column. */
export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12); // GCM standard IV size
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [ivB64, authTagB64, cipherTextB64] = stored.split(":");
  if (!ivB64 || !authTagB64 || !cipherTextB64) {
    throw new Error("Stored credential is not in the expected format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherTextB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** "EAAPuwh7...23e0b905" → "EAAP••••b905" — for display only, never enough
 * to reconstruct the real token. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
