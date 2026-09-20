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
    },
    messages: conversation.messages.map(
      (m: {
        id: string;
        direction: string;
        type: string;
        text: string;
        mediaUrl: string | null;
        mediaFileName: string | null;
        whatsappMessageId: string | null;
        status: string;
        createdAt: Date;
      }) => ({
        id: m.id,
        direction: m.direction,
        type: m.type,
        text: m.text,
        mediaUrl: m.mediaUrl,
        mediaFileName: m.mediaFileName,
        whatsappMessageId: m.whatsappMessageId,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      })
    ),
  });
}
