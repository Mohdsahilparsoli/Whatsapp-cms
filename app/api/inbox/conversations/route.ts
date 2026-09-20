import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const conversations = await prisma.conversation.findMany({
    where: { clientId: auth.clientId },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  // Real consent, when this phone number matches a known Contact — Inbox
  // uses this to disable replying to an opted-out contact, same as
  // elsewhere in the app.
  const contacts = await prisma.contact.findMany({
    where: { clientId: auth.clientId, phone: { in: conversations.map((c: { contactPhone: string }) => c.contactPhone) } },
    select: { phone: true, consent: true, tags: true },
  });
  const contactByPhone = new Map(contacts.map((c: { phone: string; consent: string; tags: string[] }) => [c.phone, c]));

  return NextResponse.json({
    conversations: conversations.map(
      (c: {
        id: string;
        contactPhone: string;
        contactName: string | null;
        unreadCount: number;
        lastMessageAt: Date;
        messages: { text: string; type: string }[];
      }) => {
        const contact = contactByPhone.get(c.contactPhone) as { consent: string; tags: string[] } | undefined;
        return {
          id: c.id,
          contactPhone: c.contactPhone,
          contactName: c.contactName,
          unreadCount: c.unreadCount,
          lastMessageAt: c.lastMessageAt.toISOString(),
          lastMessagePreview: c.messages[0]
            ? c.messages[0].type === "text"
              ? c.messages[0].text
              : c.messages[0].type === "image"
                ? "📷 Photo"
                : "📄 Document"
            : "",
          consent: contact?.consent ?? null,
          tags: contact?.tags ?? [],
        };
      }
    ),
  });
}
