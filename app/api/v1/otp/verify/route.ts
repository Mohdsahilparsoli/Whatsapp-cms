import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/apiKeyAuth";
import { normalizePhone } from "@/lib/phone";
import { hashOtp, safeEqualHex } from "@/lib/otp";

const MAX_ATTEMPTS = 5;

/**
 * POST /api/v1/otp/verify   (Authorization: Bearer wak_…)
 * { "to": "919876543210", "code": "123456" }
 * → { "valid": true | false }
 *
 * Checks the most recent code we generated for that number. A code works
 * once, expires with the template's expiry, and locks after 5 wrong tries.
 */
export async function POST(request: Request) {
  const auth = await requireApiKey(request);
  if (auth instanceof NextResponse) return auth;

  let body: { to?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const digits = body.to?.replace(/\D/g, "") ?? "";
  const code = body.code?.trim() ?? "";
  if (digits.length < 10 || !code) {
    return NextResponse.json({ error: "`to` (with country code) and `code` are required." }, { status: 400 });
  }
  const to = normalizePhone(digits);

  const otp = await prisma.otpRequest.findFirst({
    where: { clientId: auth.clientId, phone: to, verifiedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return NextResponse.json({ valid: false, reason: "expired_or_not_found" });
  if (otp.attempts >= MAX_ATTEMPTS) return NextResponse.json({ valid: false, reason: "too_many_attempts" });

  const valid = safeEqualHex(otp.codeHash, hashOtp(to, code));
  await prisma.otpRequest.update({
    where: { id: otp.id },
    data: valid ? { verifiedAt: new Date(), attempts: { increment: 1 } } : { attempts: { increment: 1 } },
  });
  return NextResponse.json(valid ? { valid: true } : { valid: false, reason: "incorrect_code" });
}
