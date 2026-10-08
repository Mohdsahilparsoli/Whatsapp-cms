import "server-only";
import { prisma } from "@/lib/db";
import { getWhatsAppCredentials, getCredentialsForRecipient } from "@/lib/whatsappCredentials";
import { normalizePhone } from "@/lib/phone";
import { getConversationWindow } from "@/lib/sessionWindowServer";
import { SESSION_CLOSED_MESSAGE } from "@/lib/sessionWindow";

/**
 * The shared tail of every free-form Inbox send: 24h-window check → POST to
 * Meta → record a MessageRecord (so ticks/status work) → upsert the
 * Conversation → log the ChatMessage in the thread. send-interactive,
 * send-location and send-media each predate this and inline the same steps;
 * newer senders (products, flows) use this instead of copying them again.
 */
export type InboxSendResult =
  | { ok: true; whatsappMessageId: string | null; conversationId: string }
  | { ok: false; status: number; error: string; code?: string };

export async function sendAndRecordInboxMessage(params: {
  clientId: string;
  /** Raw recipient phone (any format) — normalized here. */
  to: string;
  contactName?: string | null;
  /** The message-specific part of the Graph payload (type + its body). */
  payload: Record<string, unknown>;
  /** Short text for the MessageRecord / conversation preview. */
  preview: string;
  /** What to show in the Inbox thread for this message. */
  displayText: string;
}): Promise<InboxSendResult> {
  const primary = await getWhatsAppCredentials(params.clientId);
  if (!primary) {
    return { ok: false, status: 500, error: "No WhatsApp number available. Connect one in WhatsApp Account Setup." };
  }

  const digits = params.to.replace(/\D/g, "");
  if (digits.length < 10) {
    return { ok: false, status: 400, error: "Enter a valid recipient phone number (with country code)." };
  }
  const to = normalizePhone(digits);
  const credentials = (await getCredentialsForRecipient(params.clientId, to)) ?? primary;

  if (!(await getConversationWindow(params.clientId, to)).open) {
    return { ok: false, status: 409, error: SESSION_CLOSED_MESSAGE, code: "session_closed" };
  }

  let data: { messages?: { id?: string }[]; error?: { message?: string } };
  let ok: boolean;
  let httpStatus: number;
  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${credentials.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...params.payload }),
    });
    ok = res.ok;
    httpStatus = res.status;
    data = await res.json().catch(() => ({}));
  } catch {
    return { ok: false, status: 502, error: "Could not reach the WhatsApp API. Please try again." };
  }

  if (!ok) {
    const metaMessage = data.error?.message ?? "Meta rejected the message.";
    await prisma.messageRecord.create({
      data: {
        clientId: params.clientId,
        recipientName: params.contactName ?? null,
        recipientPhone: to,
        preview: params.preview,
        status: "failed",
        errorMessage: metaMessage,
        failedAt: new Date(),
      },
    });
    return { ok: false, status: httpStatus, error: metaMessage };
  }

  const whatsappMessageId = data.messages?.[0]?.id ?? null;
  await prisma.messageRecord.create({
    data: {
      clientId: params.clientId,
      recipientName: params.contactName ?? null,
      recipientPhone: to,
      preview: params.preview,
      whatsappMessageId,
      status: "sent",
      sentAt: new Date(),
    },
  });

  const conversation = await prisma.conversation.upsert({
    where: { clientId_contactPhone: { clientId: params.clientId, contactPhone: to } },
    update: { contactName: params.contactName ?? undefined, lastMessageAt: new Date() },
    create: { clientId: params.clientId, contactPhone: to, contactName: params.contactName ?? null },
  });
  await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      clientId: params.clientId,
      direction: "outbound",
      type: "text",
      text: params.displayText,
      whatsappMessageId,
      status: "sent",
    },
  });

  return { ok: true, whatsappMessageId, conversationId: conversation.id };
}
