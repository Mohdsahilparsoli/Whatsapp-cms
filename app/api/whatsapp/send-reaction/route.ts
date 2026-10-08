import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { prisma } from "@/lib/db";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";

/**
 * Reacts with an emoji to a message the customer sent (an empty emoji removes
 * the reaction). Meta only allows reacting to messages from the last 30 days.
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { chatMessageId?: string; emoji?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const emoji = body.emoji ?? "";
  if (emoji.length > 16) return NextResponse.json({ error: "Invalid emoji." }, { status: 400 });

  const message = await prisma.chatMessage.findFirst({
    where: { id: body.chatMessageId ?? "", clientId: auth.clientId, direction: "inbound" },
    include: { conversation: true },
  });
  if (!message?.whatsappMessageId) {
    return NextResponse.json({ error: "That message can't be reacted to." }, { status: 404 });
  }
  if (Date.now() - message.createdAt.getTime() > 30 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "WhatsApp only allows reacting to messages from the last 30 days." }, { status: 409 });
  }

  const credentials = await getWhatsAppCredentials(auth.clientId, message.conversation.phoneNumberId);
  if (!credentials) {
    return NextResponse.json({ error: "No WhatsApp number available. Connect one in WhatsApp Account Setup." }, { status: 500 });
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${credentials.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: message.conversation.contactPhone,
        type: "reaction",
        reaction: { message_id: message.whatsappMessageId, emoji },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message ?? "Meta rejected the reaction." }, { status: res.status });
    }
    await prisma.chatMessage.update({ where: { id: message.id }, data: { agentReaction: emoji || null } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reach the WhatsApp API. Please try again." }, { status: 502 });
  }
}
