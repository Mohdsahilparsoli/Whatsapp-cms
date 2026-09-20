import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { prisma } from "@/lib/db";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";

/**
 * Sends via the signed-in client's own connected WhatsApp account if they
 * have one (WhatsApp Account Setup), else falls back to the app-wide test
 * number from .env — see lib/whatsappCredentials.ts. This is what makes
 * "message sent + received on WhatsApp" possible even before a client has
 * connected their own account (useful for the App Review demo video), and
 * automatically switches to their real number once they do.
 *
 * Also records a real MessageRecord for every attempt (success or failure)
 * so the Inbox can show real WhatsApp-style ticks (sent/delivered/read) —
 * delivered/read only ever update if the delivery webhook is configured,
 * same as everywhere else in this app (see app/api/webhooks/meta/route.ts).
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const credentials = await getWhatsAppCredentials(auth.clientId);
  if (!credentials) {
    return NextResponse.json(
      {
        error:
          "No WhatsApp number available. Connect one in WhatsApp Account Setup, or add META_TEST_PHONE_NUMBER_ID and META_TEST_ACCESS_TOKEN to .env.",
      },
      { status: 500 }
    );
  }
  const { phoneNumberId, accessToken } = credentials;

  let body: { to?: string; message?: string; name?: string };
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
      const record = await prisma.messageRecord.create({
        data: {
          clientId: auth.clientId,
          recipientName: body.name ?? null,
          recipientPhone: to,
          preview: message,
          status: "failed",
          errorMessage: metaMessage,
          failedAt: new Date(),
        },
      });
      return NextResponse.json(
        {
          error: `${metaMessage} (Tip: the recipient must have messaged your test number in the last 24 hours for a plain text reply to work — otherwise send a template message instead.)`,
          messageRecordId: record.id,
        },
        { status: res.status }
      );
    }

    const whatsappMessageId: string | null = data.messages?.[0]?.id ?? null;
    const record = await prisma.messageRecord.create({
      data: {
        clientId: auth.clientId,
        recipientName: body.name ?? null,
        recipientPhone: to,
        preview: message,
        whatsappMessageId,
        status: "sent",
        sentAt: new Date(),
      },
    });

    // Also log this into the real conversation thread (Inbox) — find or
    // create by phone, same as inbound messages via the webhook.
    const conversation = await prisma.conversation.upsert({
      where: { clientId_contactPhone: { clientId: auth.clientId, contactPhone: to } },
      update: { contactName: body.name ?? undefined, lastMessageAt: new Date() },
      create: { clientId: auth.clientId, contactPhone: to, contactName: body.name ?? null },
    });
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        clientId: auth.clientId,
        direction: "outbound",
        type: "text",
        text: message,
        whatsappMessageId,
        status: "sent",
      },
    });

    return NextResponse.json({ ok: true, whatsappMessageId, messageRecordId: record.id, conversationId: conversation.id });
  } catch {
    return NextResponse.json({ error: "Could not reach the WhatsApp API. Please try again." }, { status: 502 });
  }
}
