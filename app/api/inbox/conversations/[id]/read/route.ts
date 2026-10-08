import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.conversation.findFirst({ where: { id, clientId: auth.clientId } });
  if (!existing) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });

  // Also tell Meta for real — until now this only reset our own unread
  // counter, so the customer's own WhatsApp never actually showed blue
  // read ticks when an agent opened the chat here. Best-effort: this is a
  // courtesy receipt, not something that should block the Inbox opening.
  const lastInbound = await prisma.chatMessage.findFirst({
    where: { conversationId: id, direction: "inbound", whatsappMessageId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (lastInbound?.whatsappMessageId) {
    const credentials = await getWhatsAppCredentials(auth.clientId, existing.phoneNumberId);
    if (credentials) {
      fetch(`https://graph.facebook.com/v25.0/${credentials.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: lastInbound.whatsappMessageId,
        }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
