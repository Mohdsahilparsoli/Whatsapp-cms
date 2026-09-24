import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { encryptSecret } from "@/lib/crypto";

/**
 * The "Connect via Facebook" path (Meta Embedded Signup). The frontend
 * (app/(app)/whatsapp-setup/page.tsx) runs Meta's JS SDK, gets an
 * authorization `code` back from FB.login(), and separately picks up
 * `wabaId`/`phoneNumberId` from Meta's WA_EMBEDDED_SIGNUP postMessage event
 * — both are sent here together.
 *
 * ⚠️ This endpoint is real and will work correctly once (both required):
 *   1. Meta App Review has approved advanced access to
 *      whatsapp_business_management for this app (in progress — see the
 *      Tech Provider onboarding conversation).
 *   2. A WhatsApp Embedded Signup Login Configuration exists in the Meta
 *      App Dashboard (Facebook Login for Business → Configurations), and
 *      its Configuration ID is set as NEXT_PUBLIC_META_CONFIG_ID in .env.
 * Until then, Meta's own popup will show its own error before this
 * endpoint is ever called, or this call will fail with a real Meta error —
 * that's Meta's state, not a bug in this code.
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json(
      {
        error:
          "NEXT_PUBLIC_META_APP_ID and META_APP_SECRET are not configured in .env — required for Embedded Signup.",
      },
      { status: 500 }
    );
  }

  let body: { code?: string; wabaId?: string; phoneNumberId?: string; businessName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const code = body.code?.trim();
  const wabaId = body.wabaId?.trim();
  const phoneNumberId = body.phoneNumberId?.trim();

  if (!code) {
    return NextResponse.json({ error: "Missing authorization code from Meta." }, { status: 400 });
  }
  if (!wabaId || !phoneNumberId) {
    return NextResponse.json(
      { error: "Missing WhatsApp Business Account ID / Phone Number ID from Meta's signup popup." },
      { status: 400 }
    );
  }

  // Step 1: exchange the short-lived authorization code for an access token.
  let accessToken: string;
  try {
    const tokenRes = await fetch(
      `https://graph.facebook.com/v25.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return NextResponse.json(
        { error: tokenData?.error?.message ?? "Meta rejected the authorization code." },
        { status: 400 }
      );
    }
    accessToken = tokenData.access_token;
  } catch {
    return NextResponse.json({ error: "Could not reach Meta to exchange the code." }, { status: 502 });
  }

  // Step 2: fetch real phone number details to show on the page.
  let phoneInfo: { display_phone_number?: string; verified_name?: string; quality_rating?: string } = {};
  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) phoneInfo = await res.json();
  } catch {
    // Non-fatal — we still have a valid token and IDs even if this lookup fails.
  }

  // Step 3: subscribe this app to the client's WABA so Meta sends real
  // message/status webhook events for their number to our webhook.
  try {
    await fetch(`https://graph.facebook.com/v25.0/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Non-fatal — connection still succeeds; webhooks for this account just
    // won't arrive until this is retried (e.g. on next reconnect).
  }

  let account;
  try {
    account = await prisma.whatsAppAccount.upsert({
      where: { clientId: auth.clientId },
      update: {
        connected: true,
        businessName: body.businessName || phoneInfo.verified_name || null,
        wabaId,
        phoneNumberId,
        displayNumber: phoneInfo.display_phone_number ?? null,
        qualityRating: phoneInfo.quality_rating ?? null,
        accessTokenEnc: encryptSecret(accessToken),
        connectedAt: new Date(),
      },
      create: {
        clientId: auth.clientId,
        connected: true,
        businessName: body.businessName || phoneInfo.verified_name || null,
        wabaId,
        phoneNumberId,
        displayNumber: phoneInfo.display_phone_number ?? null,
        qualityRating: phoneInfo.quality_rating ?? null,
        accessTokenEnc: encryptSecret(accessToken),
        connectedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("whatsapp-setup/connect: failed to save account", err);
    return NextResponse.json(
      {
        error:
          "Meta accepted the connection, but saving it failed — check CREDENTIALS_ENCRYPTION_KEY is set in .env and the server logs for details.",
      },
      { status: 500 }
    );
  }

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
