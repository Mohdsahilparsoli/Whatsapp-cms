import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/** HMAC of an OTP, bound to the phone — the plain code is never stored. */
export function hashOtp(phone: string, code: string): string {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY || process.env.META_APP_SECRET || "otp-fallback-secret";
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A cryptographically random 6-digit code (leading zeros allowed). */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
