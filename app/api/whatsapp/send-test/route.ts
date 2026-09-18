import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";

/**
 * ⚠️ Demo/testing only. This calls Meta's Graph API with ONE shared test
 * number + token from environment variables — not the real, per-client
 * WhatsApp integration (that's a later phase: each client stores/connects
 * their own WhatsApp Business Account). This exists to produce the
 * "message sent + received on WhatsApp" App Review demo video.
 *
 * Required in .env (never commit real values):
 *   META_TEST_PHONE_NUMBER_ID=...
 *   META_TEST_ACCESS_TOKEN=...
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const phoneNumberId = process.env.META_TEST_PHONE_NUMBER_ID;
  const accessToken = process.env.META_TEST_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return NextResponse.json(
      {
        error:
          "WhatsApp test credentials are not configured. Add META_TEST_PHONE_NUMBER_ID and META_TEST_ACCESS_TOKEN to .env.",
      },
      { status: 500 }
    );
  }

  let body: { to?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const to = body.to?.replace(/[^\d]/g, "");
  const message = body.message?.trim();

  if (!to || to.length < 10) {
    return NextResponse.json({ error: "Enter a valid recipient phone number (with country code)." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Enter a message." }, { status: 400 });
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Meta's most common reason this fails: no open 24-hour conversation
      // window with this recipient yet (they haven't messaged the test
      // number first, or it's been >24h). A template message works any
      // time; free text only works inside that window.
      const metaMessage = data?.error?.message ?? "Meta rejected the message.";
      return NextResponse.json(
        {
          error: `${metaMessage} (Tip: the recipient must have messaged your test number in the last 24 hours for a plain text reply to work — otherwise send a template message instead.)`,
        },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true, whatsappMessageId: data.messages?.[0]?.id ?? null });
  } catch {
    return NextResponse.json({ error: "Could not reach the WhatsApp API. Please try again." }, { status: 502 });
  }
}
