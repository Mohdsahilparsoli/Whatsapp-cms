import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { encryptSecret } from "@/lib/crypto";

/**
 * Extra WhatsApp numbers for a client (the primary number stays on the main
 * WhatsApp Account Setup connection). Like connect-manual, nothing is saved
 * until Meta itself confirms the token can read that phone number.
 */
export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const numbers = await prisma.additionalWhatsAppNumber.findMany({
    where: { clientId: auth.clientId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      wabaId: true,
      phoneNumberId: true,
      displayNumber: true,
      businessName: true,
      qualityRating: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ numbers: numbers.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })) });
}

export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { wabaId?: string; phoneNumberId?: string; accessToken?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const wabaId = body.wabaId?.trim();
  const phoneNumberId = body.phoneNumberId?.trim();
  const accessToken = body.accessToken?.trim();
  const label = body.label?.trim() || null;

  const errors: Record<string, string> = {};
  if (!wabaId) errors.wabaId = "Enter the WhatsApp Business Account ID.";
  if (!phoneNumberId) errors.phoneNumberId = "Enter the Phone Number ID.";
  if (!accessToken) errors.accessToken = "Enter the access token.";
  if (Object.keys(errors).length > 0) return NextResponse.json({ errors }, { status: 400 });

  // The primary connection must exist first — it owns the checklist and is
  // the default sender for campaigns.
  const account = await prisma.whatsAppAccount.findUnique({ where: { clientId: auth.clientId } });
  if (!account?.connected || !account.phoneNumberId) {
    return NextResponse.json({ error: "Connect your main WhatsApp number first, then add more." }, { status: 400 });
  }
  if (phoneNumberId === account.phoneNumberId) {
    return NextResponse.json({ errors: { phoneNumberId: "This is already your main number." } }, { status: 400 });
  }
  const taken = await prisma.additionalWhatsAppNumber.findUnique({ where: { phoneNumberId: phoneNumberId! } });
  const usedElsewhere = await prisma.whatsAppAccount.findFirst({ where: { phoneNumberId: phoneNumberId!, connected: true } });
  if (taken || usedElsewhere) {
    return NextResponse.json({ errors: { phoneNumberId: "This number is already connected." } }, { status: 409 });
  }

  let phoneInfo: { display_phone_number?: string; verified_name?: string; quality_rating?: string };
  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { errors: { accessToken: data?.error?.message ?? "Meta rejected these credentials." } },
        { status: 400 }
      );
    }
    phoneInfo = data;
  } catch {
    return NextResponse.json({ error: "Could not reach Meta to verify these credentials. Please try again." }, { status: 502 });
  }

  // Subscribe so Meta sends this number's webhooks to us (non-fatal).
  try {
    await fetch(`https://graph.facebook.com/v25.0/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // ignore
  }

  try {
    const created = await prisma.additionalWhatsAppNumber.create({
      data: {
        clientId: auth.clientId,
        accountId: account.id,
        label,
        wabaId: wabaId!,
        phoneNumberId: phoneNumberId!,
        displayNumber: phoneInfo.display_phone_number ?? null,
        businessName: phoneInfo.verified_name ?? null,
        qualityRating: phoneInfo.quality_rating ?? null,
        accessTokenEnc: encryptSecret(accessToken!),
      },
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    console.error("whatsapp-setup/numbers: failed to save number", err);
    return NextResponse.json({ error: "Meta accepted these credentials, but saving them failed." }, { status: 500 });
  }
}
