import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Meta's one-time verification handshake when you save this URL as the
 * webhook callback in the Meta App dashboard (WhatsApp → Configuration →
 * Webhooks). Meta calls this with hub.mode/hub.verify_token/hub.challenge;
 * we must echo back hub.challenge as plain text if the token matches
 * META_WEBHOOK_VERIFY_TOKEN (a value you make up and put in both .env and
 * the Meta dashboard).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed." }, { status: 403 });
}

interface StatusEntry {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp?: string;
  errors?: { title?: string; message?: string }[];
}

interface IncomingMessage {
  id: string;
  from: string; // sender's phone number, no "+"
  timestamp?: string;
  type: "text" | "image" | "document" | string;
  text?: { body: string };
  image?: { id: string; caption?: string };
  document?: { id: string; caption?: string; filename?: string };
}

interface ChangeValue {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  statuses?: StatusEntry[];
  messages?: IncomingMessage[];
}

/**
 * Real delivery/read status updates AND real incoming messages from Meta.
 * ⚠️ This only ever fires if:
 *  1. This server is reachable on a public HTTPS URL (use ngrok for local
 *     dev — `npm run dev` alone is not enough, Meta cannot reach localhost).
 *  2. That URL + META_WEBHOOK_VERIFY_TOKEN are saved as this app's webhook
 *     in the Meta App dashboard, subscribed to the "messages" field.
 * Without that setup, Message Status stays at "sent"/"failed" (never
 * "delivered"/"read") and the Inbox never receives real customer replies —
 * both expected, not a bug, until the webhook is configured. See
 * README-BACKEND.md.
 *
 * Multi-tenant routing: an incoming message's `metadata.phone_number_id`
 * tells us which client it belongs to, by matching it against that
 * client's connected WhatsAppAccount.phoneNumberId (WhatsApp Account
 * Setup). A message to a phone number nobody has connected yet has no
 * client to attribute it to, so it's dropped — this is the real limitation
 * of the shared-test-number setup described throughout this app; connecting
 * a real per-client number (WhatsApp Account Setup) is what fixes it.
 *
 * Always responds 200 even on internal errors — Meta disables a webhook
 * that repeatedly errors or times out, so failures here are swallowed
 * rather than surfaced as a failed HTTP response.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const entries: { changes?: { value?: ChangeValue }[] }[] = body?.entry ?? [];

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        for (const status of value.statuses ?? []) {
          await applyStatus(status);
        }

        if (value.messages && value.messages.length > 0) {
          const phoneNumberId = value.metadata?.phone_number_id;
          const clientId = phoneNumberId ? await resolveClientId(phoneNumberId) : null;
          if (clientId) {
            const senderName = value.contacts?.[0]?.profile?.name ?? null;
            for (const message of value.messages) {
              await recordIncomingMessage(clientId, senderName, message);
            }
          }
          // No matching client — see the multi-tenant note above. Nothing
          // to do; the message is simply not attributable yet.
        }
      }
    }
  } catch {
    // Malformed payload — nothing to do, but still 200 so Meta doesn't retry.
  }

  return NextResponse.json({ ok: true });
}

async function resolveClientId(phoneNumberId: string): Promise<string | null> {
  const account = await prisma.whatsAppAccount.findFirst({
    where: { phoneNumberId, connected: true },
    select: { clientId: true },
  });
  return account?.clientId ?? null;
}

async function recordIncomingMessage(clientId: string, senderName: string | null, message: IncomingMessage) {
  const phone = message.from;
  const when = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date();

  let text = "";
  let type: "text" | "image" | "document" = "text";
  if (message.type === "text") {
    text = message.text?.body ?? "";
  } else if (message.type === "image") {
    type = "image";
    text = message.image?.caption ?? "";
  } else if (message.type === "document") {
    type = "document";
    text = message.document?.caption ?? message.document?.filename ?? "";
  } else {
    text = `[Unsupported message type: ${message.type}]`;
  }
  // Note: image/document messages arrive as a Meta media `id`, not a
  // fetchable URL — actually downloading and re-hosting that media is not
  // implemented yet, so incoming media shows as a placeholder with any
  // caption/filename Meta sent, not the file itself.

  const conversation = await prisma.conversation.upsert({
    where: { clientId_contactPhone: { clientId, contactPhone: phone } },
    update: {
      contactName: senderName ?? undefined,
      lastMessageAt: when,
      unreadCount: { increment: 1 },
    },
    create: {
      clientId,
      contactPhone: phone,
      contactName: senderName,
      lastMessageAt: when,
      unreadCount: 1,
    },
  });

  await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      clientId,
      direction: "inbound",
      type,
      text,
      whatsappMessageId: message.id,
      status: "sent",
      createdAt: when,
    },
  });
}

async function applyStatus(status: StatusEntry) {
  const record = await prisma.messageRecord.findUnique({ where: { whatsappMessageId: status.id } });
  if (record) {
    const when = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
    if (status.status === "delivered") {
      await prisma.messageRecord.update({
        where: { id: record.id },
        data: { status: "delivered", deliveredAt: when },
      });
    } else if (status.status === "read") {
      await prisma.messageRecord.update({
        where: { id: record.id },
        data: { status: "read", readAt: when, deliveredAt: record.deliveredAt ?? when },
      });
    } else if (status.status === "failed") {
      await prisma.messageRecord.update({
        where: { id: record.id },
        data: {
          status: "failed",
          errorMessage: status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? "Delivery failed.",
        },
      });
    }
  }

  // Also update the matching outbound ChatMessage, if this status is for a
  // message sent from the Inbox (rather than a Campaign/Bulk Sender send).
  const chatMessage = await prisma.chatMessage.findUnique({ where: { whatsappMessageId: status.id } });
  if (chatMessage && (status.status === "delivered" || status.status === "read" || status.status === "failed")) {
    await prisma.chatMessage.update({ where: { id: chatMessage.id }, data: { status: status.status } });
  }
}
