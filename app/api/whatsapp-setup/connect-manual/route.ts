import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { encryptSecret } from "@/lib/crypto";

/**
 * The "I already have these values from Meta's console" path — works today,
 * no App Review or Embedded Signup config needed. We still don't just trust
 * whatever's typed in: before saving anything, we call Meta's own API with
 * the given token to confirm it's real and actually has access to that
 * phone number. Only a successful Meta response gets saved.
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { wabaId?: string; phoneNumberId?: string; accessToken?: string; businessName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const wabaId = body.wabaId?.trim();
  const phoneNumberId = body.phoneNumberId?.trim();
  const accessToken = body.accessToken?.trim();
  const businessName = body.businessName?.trim();

  const errors: Record<string, string> = {};
  if (!wabaId) errors.wabaId = "Enter the WhatsApp Business Account ID.";
  if (!phoneNumberId) errors.phoneNumberId = "Enter the Phone Number ID.";
  if (!accessToken) errors.accessToken = "Enter the access token.";
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  // Validate against Meta itself — if this succeeds, the token really can
  // read this phone number, which is the only proof worth trusting.
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
    return NextResponse.json(
      { error: "Could not reach Meta to verify these credentials. Please try again." },
      { status: 502 }
    );
  }

  const account = await prisma.whatsAppAccount.upsert({
    where: { clientId: auth.clientId },
    update: {
      connected: true,
      businessName: businessName || phoneInfo.verified_name || null,
      wabaId,
      phoneNumberId,
      displayNumber: phoneInfo.display_phone_number ?? null,
      qualityRating: phoneInfo.quality_rating ?? null,
      accessTokenEnc: encryptSecret(accessToken!),
      connectedAt: new Date(),
    },
    create: {
      clientId: auth.clientId,
      connected: true,
      businessName: businessName || phoneInfo.verified_name || null,
      wabaId,
      phoneNumberId,
      displayNumber: phoneInfo.display_phone_number ?? null,
      qualityRating: phoneInfo.quality_rating ?? null,
      accessTokenEnc: encryptSecret(accessToken!),
      connectedAt: new Date(),
    },
  });

  return NextResponse.json({
    connected: true,
    businessName: account.businessName,
    wabaId: account.wabaId,
    phoneNumberId: account.phoneNumberId,
    displayNumber: account.displayNumber,
    qualityRating: account.qualityRating,
    connectedAt: account.connectedAt?.toISOString() ?? null,
  });
}
