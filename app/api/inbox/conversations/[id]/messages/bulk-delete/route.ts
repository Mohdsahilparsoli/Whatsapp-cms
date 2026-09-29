import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

type Params = { params: Promise<{ id: string }> };

/** Deletes several messages from a conversation at once — the Inbox's
 * multi-select "Delete" action. Every id is required to actually belong to
 * this conversation (and this client, via the conversation lookup below),
 * so a stray/forged id in the list can't delete anything outside it. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({ where: { id, clientId: auth.clientId } });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  let body: { messageIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messageIds = Array.isArray(body.messageIds) ? body.messageIds.filter((x) => typeof x === "string") : [];
  if (messageIds.length === 0) {
    return NextResponse.json({ error: "Select at least one message." }, { status: 400 });
  }

  const result = await prisma.chatMessage.deleteMany({
    where: { id: { in: messageIds }, conversationId: id },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
