import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { normalizePhone } from "@/lib/phone";
import { mergeDuplicateConversationsForClient } from "@/lib/mergeDuplicateConversations";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  // Self-healing: fold any conversations that split into two for the same
  // real number (see lib/mergeDuplicateConversations.ts) back into one
  // before listing them — a customer should only ever have one chat here.
  await mergeDuplicateConversationsForClient(auth.clientId);

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
  // Matched by normalized phone, not a raw string match — a Contact typed
  // without its country code (e.g. "9818186876") still needs to match a
  // Conversation whose number came from Meta's webhook with one
  // ("919818186876"), so every contact for this client is fetched and
  // compared on the same canonical form rather than filtering the query by
  // the raw contactPhone strings.
  const contacts = await prisma.contact.findMany({
    where: { clientId: auth.clientId },
    select: { phone: true, consent: true, tags: true },
  });
  const contactByPhone = new Map(
    contacts.map((c: { phone: string; consent: string; tags: string[] }) => [normalizePhone(c.phone), c])
  );

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
        const contact = contactByPhone.get(normalizePhone(c.contactPhone)) as
          | { consent: string; tags: string[] }
          | undefined;
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
                : c.messages[0].type === "video"
                  ? "🎥 Video"
                  : c.messages[0].type === "audio"
                    ? "🎤 Voice message"
                    : "📄 Document"
            : "",
          consent: contact?.consent ?? null,
          tags: contact?.tags ?? [],
        };
      }
    ),
  });
}
