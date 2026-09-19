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

/**
 * Real delivery/read status updates from Meta. ⚠️ This only ever fires if:
 *  1. This server is reachable on a public HTTPS URL (use ngrok for local
 *     dev — `npm run dev` alone is not enough, Meta cannot reach localhost).
 *  2. That URL + META_WEBHOOK_VERIFY_TOKEN are saved as this app's webhook
 *     in the Meta App dashboard, subscribed to the "messages" field.
 * Without that setup, messages will only ever show as "sent" or "failed" on
 * the Message Status page (never "delivered"/"read") — which is expected,
 * not a bug, until the webhook is configured. See README-BACKEND.md.
 *
 * Always responds 200 even on internal errors — Meta disables a webhook
 * that repeatedly errors or times out, so failures here are swallowed
 * rather than surfaced as a failed HTTP response.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const entries: { changes?: { value?: { statuses?: StatusEntry[] } }[] }[] = body?.entry ?? [];

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          await applyStatus(status);
        }
      }
    }
  } catch {
    // Malformed payload — nothing to do, but still 200 so Meta doesn't retry.
  }

  return NextResponse.json({ ok: true });
}

async function applyStatus(status: StatusEntry) {
  const record = await prisma.messageRecord.findUnique({ where: { whatsappMessageId: status.id } });
  if (!record) return; // a status update for a message we don't have a row for — ignore

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
  // "sent" from the webhook is redundant with what we already record at
  // send time — nothing to update.
}
