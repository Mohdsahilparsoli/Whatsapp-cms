import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

type Params = { params: Promise<{ id: string }> };

/** Deletes every message in a conversation but keeps the conversation (and
 * the contact's thread) itself — the Inbox's "Clear chat" action, matching
 * WhatsApp's own "clear chat" (as opposed to "delete chat", which also
 * removes the thread — see the sibling DELETE handler in ../route.ts). */
export async function POST(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({ where: { id, clientId: auth.clientId } });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  await prisma.chatMessage.deleteMany({ where: { conversationId: id } });
  await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });

  return NextResponse.json({ ok: true });
}
