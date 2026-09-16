import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Generates a readable one-time temporary password (e.g. "Wa-7f3k29"), used
 * when Super Admin creates a client or resets a client's password. Shown to
 * Super Admin exactly once — it is never stored or shown again in plain text.
 */
export function generateTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/O/1/l/i to avoid confusion
  let random = "";
  for (let i = 0; i < 8; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }
  return `Wa-${random}`;
}
