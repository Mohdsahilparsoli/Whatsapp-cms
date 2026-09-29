import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

type Params = { params: Promise<{ id: string; messageId: string }> };

/** Deletes exactly one message from a conversation — the Inbox's
 * per-message "Delete" action (from the "..." menu on a message, or from
 * the media lightbox), same idea as WhatsApp's own single-message delete.
 * Scoped to both the conversation and this client so one client can never
 * reach into another's chat. Doesn't touch any other message that quotes
 * this one (replyTo* is a snapshot, not a live link — see schema.prisma). */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id, messageId } = await params;

  const conversation = await prisma.conversation.findFirst({ where: { id, clientId: auth.clientId } });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, conversationId: id } });
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  await prisma.chatMessage.delete({ where: { id: messageId } });
  return NextResponse.json({ ok: true });
}
