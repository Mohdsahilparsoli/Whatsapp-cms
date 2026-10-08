import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, clientId: auth.clientId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      contactPhone: conversation.contactPhone,
      contactName: conversation.contactName,
      adSourceType: conversation.adSourceType,
      adSourceUrl: conversation.adSourceUrl,
      adHeadline: conversation.adHeadline,
      blocked: conversation.blocked,
    },
    messages: conversation.messages.map(
      (m: {
        id: string;
        direction: string;
        type: string;
        text: string;
        mediaUrl: string | null;
        mediaFileName: string | null;
        latitude: number | null;
        longitude: number | null;
        locationName: string | null;
        locationAddress: string | null;
        whatsappMessageId: string | null;
        status: string;
        campaignName: string | null;
        templateName: string | null;
        replyToId: string | null;
        replyToText: string | null;
        replyToType: string | null;
        replyToDirection: string | null;
        customerReaction: string | null;
        agentReaction: string | null;
        createdAt: Date;
      }) => ({
        id: m.id,
        direction: m.direction,
        type: m.type,
        text: m.text,
        mediaUrl: m.mediaUrl,
        mediaFileName: m.mediaFileName,
        latitude: m.latitude,
        longitude: m.longitude,
        locationName: m.locationName,
        locationAddress: m.locationAddress,
        whatsappMessageId: m.whatsappMessageId,
        status: m.status,
        campaignName: m.campaignName,
        templateName: m.templateName,
        replyToId: m.replyToId,
        replyToText: m.replyToText,
        replyToType: m.replyToType,
        replyToDirection: m.replyToDirection,
        customerReaction: m.customerReaction,
        agentReaction: m.agentReaction,
        createdAt: m.createdAt.toISOString(),
      })
    ),
  });
}

/** Deletes the whole conversation (cascades to every ChatMessage row — see
 * ChatMessage.conversation's onDelete: Cascade in schema.prisma). Used by
 * the Inbox's "Delete chat" action — unlike "Clear chat" (the sibling
 * /clear route), this also removes the contact from the conversation list
 * entirely; a new message from them later starts a fresh conversation. */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({ where: { id, clientId: auth.clientId } });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  await prisma.conversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
