import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";

type Params = { params: Promise<{ id: string }> };

/**
 * Shows a real "typing…" indicator on the CUSTOMER's own WhatsApp app —
 * Meta's Cloud API only supports this one direction (business → customer).
 * There is no webhook or field that tells a business when a customer is
 * typing, so a "customer is typing" indicator in this Inbox isn't possible
 * without WhatsApp adding that themselves — this is the real, honest half
 * of the feature.
 *
 * It piggybacks on the mark-as-read call: Meta requires a specific message
 * id to attach `typing_indicator` to, so this marks the customer's own
 * most recent message as read (a real fix on its own — nothing in this app
 * previously told Meta a message had actually been read) and shows typing
 * under it. Meta auto-dismisses the indicator after ~25s, or the moment a
 * real message is sent — so the Inbox just calls this again every time the
 * agent resumes typing after a pause (see the throttle in
 * app/(app)/inbox/page.tsx), rather than trying to track a precise timer.
 */
export async function POST(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({ where: { id, clientId: auth.clientId } });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const lastInbound = await prisma.chatMessage.findFirst({
    where: { conversationId: id, direction: "inbound", whatsappMessageId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (!lastInbound?.whatsappMessageId) {
    return NextResponse.json({ ok: false, reason: "No customer message to show typing under yet." });
  }

  const credentials = await getWhatsAppCredentials(auth.clientId, conversation.phoneNumberId);
  if (!credentials) {
    return NextResponse.json({ ok: false, reason: "No WhatsApp number connected." });
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${credentials.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: lastInbound.whatsappMessageId,
        typing_indicator: { type: "text" },
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return NextResponse.json({ ok: false, reason: data?.error?.message ?? "Meta rejected the request." });
    }
  } catch {
    // Best-effort — a failed typing indicator is a cosmetic nicety, not
    // something that should surface as an error to the agent.
    return NextResponse.json({ ok: false, reason: "Could not reach the WhatsApp API." });
  }

  return NextResponse.json({ ok: true });
}
