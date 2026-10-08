import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";
import { storeFile } from "@/lib/fileStorage";
import { normalizeMetaStatus } from "@/lib/metaTemplates";
import { normalizePhone } from "@/lib/phone";
import { randomUUID } from "node:crypto";

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
  type: "text" | "image" | "document" | "video" | "audio" | "location" | "button" | "interactive" | string;
  text?: { body: string };
  image?: { id: string; caption?: string };
  document?: { id: string; caption?: string; filename?: string };
  video?: { id: string; caption?: string };
  /** Voice note (voice: true) or an audio file the customer sent. */
  audio?: { id: string; voice?: boolean };
  /** A pin the customer shared from WhatsApp's attach → Location. */
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  /** Legacy quick-reply tap on a Meta Message Template's QUICK_REPLY button. */
  button?: { text: string; payload?: string };
  /** Current-format reply to a QUICK_REPLY (or list/interactive) button. */
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
    /** The customer's submitted answers from a WhatsApp Flow. response_json
     * is a JSON *string* of {field: value, ..., flow_token}. */
    nfm_reply?: { name?: string; body?: string; response_json?: string };
  };
  /** A cart the customer sent from our catalog. */
  order?: {
    catalog_id?: string;
    text?: string;
    product_items?: { product_retailer_id?: string; quantity?: number; item_price?: number; currency?: string }[];
  };
  /** Present when the customer swiped-to-reply/quoted one of our earlier
   * messages — `id` is that earlier message's own WhatsApp message id
   * (matches ChatMessage.whatsappMessageId), which lets the Inbox show the
   * same quoted-reply preview WhatsApp itself shows them. */
  context?: { id?: string };
}

interface ChangeValue {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  statuses?: StatusEntry[];
  messages?: IncomingMessage[];
}

/** Real-time Meta Message Template review updates — arrives on a separate
 * webhook field ("message_template_status_update"), not "messages". See
 * lib/metaTemplates.ts for the rest of the real Template system this feeds. */
interface TemplateStatusValue {
  event?: string; // "APPROVED" | "REJECTED" | "PENDING" | "PAUSED" | "DISABLED" | ...
  message_template_id?: number | string;
  message_template_name?: string;
  reason?: string;
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
    const entries: { changes?: { field?: string; value?: ChangeValue | TemplateStatusValue }[] }[] =
      body?.entry ?? [];

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        if (change.field === "message_template_status_update") {
          await applyTemplateStatusUpdate(value as TemplateStatusValue);
          continue;
        }

        const messagesValue = value as ChangeValue;
        for (const status of messagesValue.statuses ?? []) {
          await applyStatus(status);
        }

        if (messagesValue.messages && messagesValue.messages.length > 0) {
          const phoneNumberId = messagesValue.metadata?.phone_number_id;
          const clientId = phoneNumberId ? await resolveClientId(phoneNumberId) : null;
          if (clientId) {
            const senderName = messagesValue.contacts?.[0]?.profile?.name ?? null;
            for (const message of messagesValue.messages) {
              await recordIncomingMessage(clientId, senderName, message, phoneNumberId);
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

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
  "video/mp4": ".mp4",
  "video/3gpp": ".3gp",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/amr": ".amr",
};

/**
 * Real Meta Media API download for an inbound photo/document.
 *
 * Meta only ever gives us a media `id` in the webhook payload, never a
 * fetchable URL. Turning that into an actual file takes two authenticated
 * requests, both using the SAME client's WhatsApp access token that
 * received the message (Meta scopes media by the app/token that owns it):
 *   1. GET /{media-id} → { url, mime_type, ... } — a short-lived signed URL.
 *   2. GET that url (still with our Bearer token) → the raw file bytes.
 * The bytes are then re-hosted via storeFile() (Vercel Blob in production,
 * local disk in dev) so the Inbox can display/link it like any other file
 * we serve — Meta's signed URL expires, so we never store that directly.
 *
 * Returns null (rather than throwing) on any failure — a media message
 * that fails to download still gets recorded as a placeholder, exactly as
 * before this feature existed, instead of dropping the whole webhook.
 */
async function downloadAndStoreIncomingMedia(
  clientId: string,
  mediaId: string,
  fileNameHint: string | undefined,
  kind: "image" | "document" | "video" | "audio",
  phoneNumberId?: string
): Promise<{ url: string; fileName: string } | null> {
  try {
    const credentials = await getWhatsAppCredentials(clientId, phoneNumberId);
    if (!credentials) {
      console.error(`[incoming-media] no WhatsApp credentials found for client ${clientId}`);
      return null;
    }

    const metaRes = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!metaRes.ok) {
      console.error(
        `[incoming-media] media metadata fetch failed: ${metaRes.status} ${metaRes.statusText} — ${await metaRes
          .text()
          .catch(() => "")}`
      );
      return null;
    }
    const meta: { url?: string; mime_type?: string } = await metaRes.json();
    if (!meta.url) {
      console.error("[incoming-media] media metadata response had no url", meta);
      return null;
    }

    const fileRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!fileRes.ok) {
      console.error(`[incoming-media] file download failed: ${fileRes.status} ${fileRes.statusText}`);
      return null;
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    const mimeType = meta.mime_type?.split(";")[0]?.trim() ?? "application/octet-stream";
    const extension = MIME_EXTENSIONS[mimeType] ?? (kind === "image" ? ".jpg" : kind === "video" ? ".mp4" : kind === "audio" ? ".ogg" : "");
    const fileName =
      fileNameHint && fileNameHint.trim().length > 0 ? fileNameHint : `${kind}-${randomUUID()}${extension}`;
    const storageKey = `${randomUUID()}${extension}`;

    const stored = await storeFile(buffer, ["inbox", clientId, storageKey], mimeType);
    console.log(`[incoming-media] stored ${kind} for client ${clientId} at ${stored.url}`);
    return { url: stored.url, fileName };
  } catch (err) {
    console.error("[incoming-media] unexpected error downloading/storing media:", err);
    return null;
  }
}

/** "first_name" → "First name" */
function prettyKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A submitted WhatsApp Flow → readable lines for the Inbox thread. */
function formatFlowResponse(responseJson: string | undefined): string {
  const header = "📋 Flow response";
  if (!responseJson) return header;
  try {
    const parsed = JSON.parse(responseJson) as Record<string, unknown>;
    const lines = Object.entries(parsed)
      .filter(([key]) => key !== "flow_token")
      .map(([key, value]) => {
        const shown =
          Array.isArray(value) ? value.join(", ") : value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);
        return `${prettyKey(key)}: ${shown}`;
      });
    return lines.length > 0 ? `${header}\n${lines.join("\n")}` : header;
  } catch {
    return `${header}\n${responseJson}`;
  }
}

/** A catalog cart the customer sent → readable lines for the Inbox thread. */
function formatOrder(order: NonNullable<IncomingMessage["order"]>): string {
  const items = order.product_items ?? [];
  const lines = items.map((item) => {
    const price = item.item_price != null ? ` @ ${item.item_price} ${item.currency ?? ""}`.trimEnd() : "";
    return `• ${item.product_retailer_id ?? "Item"} × ${item.quantity ?? 1}${price}`;
  });
  const note = order.text?.trim() ? `\n\n“${order.text.trim()}”` : "";
  return `🛒 Order (${items.length} item${items.length === 1 ? "" : "s"})\n${lines.join("\n")}${note}`;
}

async function resolveClientId(phoneNumberId: string): Promise<string | null> {
  const account = await prisma.whatsAppAccount.findFirst({
    where: { phoneNumberId, connected: true },
    select: { clientId: true },
  });
  if (account) return account.clientId;
  // Multi-number: an additional number belonging to some client.
  const extra = await prisma.additionalWhatsAppNumber.findUnique({
    where: { phoneNumberId },
    select: { clientId: true },
  });
  return extra?.clientId ?? null;
}

async function recordIncomingMessage(
  clientId: string,
  senderName: string | null,
  message: IncomingMessage,
  phoneNumberId?: string
) {
  // Meta already sends this with a country code (no "+"), but normalized
  // anyway so it's always byte-identical to whatever a campaign send or a
  // manual reply wrote for this same person — see lib/phone.ts.
  const phone = normalizePhone(message.from);
  const when = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date();

  let text = "";
  let type: "text" | "image" | "document" | "video" | "audio" | "location" = "text";
  let location: { latitude: number; longitude: number; name: string | null; address: string | null } | null = null;
  let mediaUrl: string | null = null;
  let mediaFileName: string | null = null;

  if (message.type === "text") {
    text = message.text?.body ?? "";
  } else if (message.type === "location" && message.location) {
    type = "location";
    location = {
      latitude: message.location.latitude,
      longitude: message.location.longitude,
      name: message.location.name ?? null,
      address: message.location.address ?? null,
    };
  } else if (message.type === "audio") {
    type = "audio";
    if (message.audio?.id) {
      const downloaded = await downloadAndStoreIncomingMedia(clientId, message.audio.id, undefined, "audio", phoneNumberId);
      if (downloaded) {
        mediaUrl = downloaded.url;
        mediaFileName = downloaded.fileName;
      }
    }
  } else if (message.type === "order" && message.order) {
    text = formatOrder(message.order);
  } else if (message.type === "button") {
    // A tap on a Meta Message Template's QUICK_REPLY button — treat its
    // label like a normal text reply from the customer (see
    // lib/metaTemplates.ts's toMetaButtons for how these buttons are sent).
    text = message.button?.text ?? "";
  } else if (message.type === "interactive") {
    text =
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title ??
      (message.interactive?.nfm_reply ? formatFlowResponse(message.interactive.nfm_reply.response_json) : "");
  } else if (message.type === "image") {
    type = "image";
    text = message.image?.caption ?? "";
    if (message.image?.id) {
      const downloaded = await downloadAndStoreIncomingMedia(clientId, message.image.id, undefined, "image", phoneNumberId);
      if (downloaded) {
        mediaUrl = downloaded.url;
        mediaFileName = downloaded.fileName;
      }
    }
  } else if (message.type === "document") {
    type = "document";
    text = message.document?.caption ?? message.document?.filename ?? "";
    if (message.document?.id) {
      const downloaded = await downloadAndStoreIncomingMedia(
        clientId,
        message.document.id,
        message.document.filename,
        "document",
        phoneNumberId
      );
      if (downloaded) {
        mediaUrl = downloaded.url;
        mediaFileName = downloaded.fileName;
      }
    }
  } else if (message.type === "video") {
    type = "video";
    text = message.video?.caption ?? "";
    if (message.video?.id) {
      const downloaded = await downloadAndStoreIncomingMedia(clientId, message.video.id, undefined, "video", phoneNumberId);
      if (downloaded) {
        mediaUrl = downloaded.url;
        mediaFileName = downloaded.fileName;
      }
    }
  } else {
    text = `[Unsupported message type: ${message.type}]`;
  }
  // If the download failed for any reason (token issue, network, media
  // expired), mediaUrl stays null and the Inbox falls back to its existing
  // "received (not downloaded)" placeholder — same behavior as before.

  // The customer swiped-to-reply/quoted one of our earlier messages —
  // Meta's context.id is that message's own whatsappMessageId, so it's
  // looked up here to snapshot a quoted preview, same as an outbound reply
  // does in app/api/whatsapp/send-test/route.ts.
  const repliedTo = message.context?.id
    ? await prisma.chatMessage.findFirst({ where: { whatsappMessageId: message.context.id, clientId } })
    : null;

  const conversation = await prisma.conversation.upsert({
    where: { clientId_contactPhone: { clientId, contactPhone: phone } },
    update: {
      contactName: senderName ?? undefined,
      lastMessageAt: when,
      unreadCount: { increment: 1 },
      // Remember which of the client's numbers this customer wrote to.
      ...(phoneNumberId ? { phoneNumberId } : {}),
    },
    create: {
      clientId,
      contactPhone: phone,
      contactName: senderName,
      lastMessageAt: when,
      unreadCount: 1,
      phoneNumberId: phoneNumberId ?? null,
    },
  });

  await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      clientId,
      direction: "inbound",
      type,
      text,
      mediaUrl,
      mediaFileName,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      locationName: location?.name ?? null,
      locationAddress: location?.address ?? null,
      whatsappMessageId: message.id,
      status: "sent",
      createdAt: when,
      replyToId: repliedTo?.id ?? null,
      replyToText: repliedTo?.text ?? null,
      replyToType: repliedTo?.type ?? null,
      replyToDirection: repliedTo?.direction ?? null,
    },
  });
}

/**
 * Real-time sync for a template's Meta review outcome — matched back to our
 * CustomTemplate row by metaTemplateId (globally unique, set when submitted
 * via app/api/templates/[id]/submit/route.ts). Not scoped to a client here
 * since the webhook payload doesn't carry our clientId — the metaTemplateId
 * match is what does that, same idea as MessageRecord.whatsappMessageId.
 * A template we don't recognize (deleted locally, or not ours) is a no-op.
 */
async function applyTemplateStatusUpdate(value: TemplateStatusValue) {
  if (!value.message_template_id) return;
  const metaTemplateId = String(value.message_template_id);

  const template = await prisma.customTemplate.findFirst({ where: { metaTemplateId } });
  if (!template) return;

  await prisma.customTemplate.update({
    where: { id: template.id },
    data: {
      metaStatus: normalizeMetaStatus(value.event),
      metaRejectionReason: value.reason && value.reason !== "NONE" ? value.reason : null,
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
