import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/apiKeyAuth";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";
import { normalizePhone } from "@/lib/phone";
import { generateOtpCode, hashOtp } from "@/lib/otp";

const MAX_PER_PHONE_PER_HOUR = 5;

/**
 * POST /api/v1/otp/send   (Authorization: Bearer wak_…)
 * { "to": "919876543210", "template": "login_code" (optional), "code": "123456" (optional) }
 *
 * Sends the client's approved Authentication template with a one-time code.
 * Omit `code` to have us generate and track it — then check it with
 * /api/v1/otp/verify. Supply your own `code` if you manage verification
 * yourself (we then just deliver it and don't store anything).
 */
export async function POST(request: Request) {
  const auth = await requireApiKey(request);
  if (auth instanceof NextResponse) return auth;

  let body: { to?: string; template?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const digits = body.to?.replace(/\D/g, "") ?? "";
  if (digits.length < 10) {
    return NextResponse.json({ error: "`to` must be a phone number with country code." }, { status: 400 });
  }
  const to = normalizePhone(digits);

  const template = await prisma.customTemplate.findFirst({
    where: {
      clientId: auth.clientId,
      templateKind: "authentication",
      metaStatus: "approved",
      ...(body.template ? { name: body.template } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (!template?.metaLanguageCode) {
    return NextResponse.json(
      { error: "No approved Authentication template found. Create one on the Templates page and wait for Meta to approve it." },
      { status: 400 }
    );
  }

  const generated = !body.code;
  const code = body.code ? body.code.trim() : generateOtpCode();
  if (!/^[A-Za-z0-9]{4,15}$/.test(code)) {
    return NextResponse.json({ error: "`code` must be 4–15 letters or digits." }, { status: 400 });
  }

  const recent = await prisma.otpRequest.count({
    where: { clientId: auth.clientId, phone: to, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= MAX_PER_PHONE_PER_HOUR) {
    return NextResponse.json(
      { error: "Too many codes requested for this number. Try again later." },
      { status: 429 }
    );
  }

  const credentials = await getWhatsAppCredentials(auth.clientId);
  if (!credentials) {
    return NextResponse.json({ error: "No WhatsApp number connected." }, { status: 400 });
  }

  const expiryMinutes = (template.extra as { expiryMinutes?: number } | null)?.expiryMinutes ?? 10;

  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/v25.0/${credentials.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template.name,
          language: { code: template.metaLanguageCode },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        },
      }),
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the WhatsApp API." }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));

  const preview = "Verification code (hidden)";
  if (!res.ok) {
    const message = data?.error?.message ?? "Meta rejected the message.";
    await prisma.messageRecord.create({
      data: {
        clientId: auth.clientId,
        recipientPhone: to,
        templateId: template.id,
        templateName: template.name,
        preview,
        status: "failed",
        errorMessage: message,
        failedAt: new Date(),
      },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await prisma.messageRecord.create({
    data: {
      clientId: auth.clientId,
      recipientPhone: to,
      templateId: template.id,
      templateName: template.name,
      preview,
      whatsappMessageId: data.messages?.[0]?.id ?? null,
      status: "sent",
      sentAt: new Date(),
    },
  });

  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
  if (generated) {
    await prisma.otpRequest.create({
      data: { clientId: auth.clientId, phone: to, codeHash: hashOtp(to, code), expiresAt },
    });
  }

  return NextResponse.json({ ok: true, generated, expiresAt: expiresAt.toISOString() });
}
