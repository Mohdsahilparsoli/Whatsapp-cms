import "server-only";
import { prisma } from "@/lib/db";
import { getQueueSettings } from "@/lib/queueSettings";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";

interface BatchContact {
  id: string;
  phone: string;
  name?: string | null;
}

interface SendContext {
  clientId: string;
  queueJobId: string;
  campaignId?: string | null;
  campaignName?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  preview: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sends one contact's message via Meta's Graph API — same shared
 * test-number credentials as everywhere else this app sends real messages
 * (see app/api/whatsapp/send-test/route.ts for the full explanation). */
async function sendOne(
  phone: string,
  messageText: string,
  phoneNumberId: string,
  accessToken: string
): Promise<{ ok: true; whatsappMessageId: string | null } | { ok: false; error: string }> {
  const to = phone.replace(/\D/g, "");
  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: messageText },
      }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) return { ok: true, whatsappMessageId: data?.messages?.[0]?.id ?? null };
    return { ok: false, error: data?.error?.message ?? "Meta rejected the message." };
  } catch {
    return { ok: false, error: "Could not reach the WhatsApp API." };
  }
}

/** Creates (or, on retry, updates) the one real MessageRecord row for a
 * single send attempt — this is what the Message Status page reads. Matched
 * on (queueJobId, recipientPhone) so a retry updates the same row instead of
 * piling up duplicates. */
async function recordMessage(
  ctx: SendContext,
  contact: BatchContact,
  result: { ok: true; whatsappMessageId: string | null } | { ok: false; error: string }
) {
  const existing = await prisma.messageRecord.findFirst({
    where: { queueJobId: ctx.queueJobId, recipientPhone: contact.phone },
  });

  const data = {
    clientId: ctx.clientId,
    campaignId: ctx.campaignId ?? null,
    campaignName: ctx.campaignName ?? null,
    queueJobId: ctx.queueJobId,
    recipientName: contact.name ?? null,
    recipientPhone: contact.phone,
    templateId: ctx.templateId ?? null,
    templateName: ctx.templateName ?? null,
    preview: ctx.preview,
    whatsappMessageId: result.ok ? result.whatsappMessageId : null,
    status: result.ok ? ("sent" as const) : ("failed" as const),
    errorMessage: result.ok ? null : result.error,
    sentAt: result.ok ? new Date() : null,
    // A retry that succeeds should clear any earlier failedAt/errorMessage;
    // a retry that fails again just refreshes failedAt.
    failedAt: result.ok ? null : new Date(),
    deliveredAt: null,
    readAt: null,
  };

  if (existing) {
    await prisma.messageRecord.update({ where: { id: existing.id }, data });
  } else {
    await prisma.messageRecord.create({ data });
  }
}

/** Sends a batch of contacts, spacing sends out to respect messagesPerMinute,
 * and records a real MessageRecord for each one. Uses the client's own
 * connected WhatsApp account if they have one, else falls back to the
 * shared test number (see lib/whatsappCredentials.ts). */
async function sendBatch(
  contacts: BatchContact[],
  messageText: string,
  messagesPerMinute: number,
  ctx: SendContext
) {
  const credentials = await getWhatsAppCredentials(ctx.clientId);

  if (!credentials) {
    const error =
      "No WhatsApp number available — connect one in WhatsApp Account Setup, or configure META_TEST_PHONE_NUMBER_ID / META_TEST_ACCESS_TOKEN in .env.";
    for (const contact of contacts) {
      await recordMessage(ctx, contact, { ok: false, error });
    }
    return { sent: 0, failed: contacts.length, lastError: error };
  }

  const delayMs = Math.max(Math.round(60_000 / Math.max(messagesPerMinute, 1)), 50);
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;

  for (const contact of contacts) {
    const result = await sendOne(contact.phone, messageText, credentials.phoneNumberId, credentials.accessToken);
    await recordMessage(ctx, contact, result);
    if (result.ok) sent += 1;
    else {
      failed += 1;
      lastError = result.error;
    }
    await sleep(delayMs);
  }

  return { sent, failed, lastError };
}

/**
 * Splits `contacts` into batches (per the client's batchSize setting),
 * creates a real QueueJob row for each, and sends them respecting the
 * client's messagesPerMinute rate limit. A batch where every message failed
 * is marked "failed" (retryable from the Queue page); otherwise "completed"
 * (individual failures within an otherwise-working batch are just recorded
 * in that job's failedCount, not retried automatically). Every individual
 * send — success or failure — also produces a real MessageRecord row (see
 * app/(app)/message-status).
 *
 * Returns `{ paused: true }` without sending anything if the client's queue
 * is currently paused — callers should surface that to the user rather than
 * silently doing nothing.
 */
export async function enqueueAndProcess(params: {
  clientId: string;
  name: string;
  campaignId?: string | null;
  contacts: BatchContact[];
  templateId: string;
  templateName?: string;
  messageText: string;
}): Promise<{ sent: number; failed: number; paused: boolean }> {
  const settings = await getQueueSettings(params.clientId);
  if (settings.paused) {
    return { sent: 0, failed: 0, paused: true };
  }

  const batchSize = Math.max(settings.batchSize, 1);
  const chunks: BatchContact[][] = [];
  for (let i = 0; i < params.contacts.length; i += batchSize) {
    chunks.push(params.contacts.slice(i, i + batchSize));
  }

  let totalSent = 0;
  let totalFailed = 0;

  for (const batchContacts of chunks) {
    if (batchContacts.length === 0) continue;

    const job = await prisma.queueJob.create({
      data: {
        clientId: params.clientId,
        campaignId: params.campaignId ?? null,
        name: params.name,
        contactIds: batchContacts.map((c) => c.id),
        templateId: params.templateId,
        messageText: params.messageText,
        batchSize: batchContacts.length,
        maxAttempts: settings.maxRetryAttempts,
        status: "processing",
        attempts: 1,
        lastRunAt: new Date(),
      },
    });

    const result = await sendBatch(batchContacts, params.messageText, settings.messagesPerMinute, {
      clientId: params.clientId,
      queueJobId: job.id,
      campaignId: params.campaignId,
      campaignName: params.name,
      templateId: params.templateId,
      templateName: params.templateName,
      preview: params.messageText.slice(0, 200),
    });
    totalSent += result.sent;
    totalFailed += result.failed;

    const wholeBatchFailed = result.sent === 0 && batchContacts.length > 0;
    await prisma.queueJob.update({
      where: { id: job.id },
      data: {
        status: wholeBatchFailed ? "failed" : "completed",
        sentCount: result.sent,
        failedCount: result.failed,
        errorMessage: wholeBatchFailed ? result.lastError ?? "All messages in this batch failed." : null,
      },
    });
  }

  return { sent: totalSent, failed: totalFailed, paused: false };
}

/** Re-sends a failed job's contacts (same message, same batch) — used by
 * the Queue page's "Retry" button. Updates the same MessageRecord rows
 * rather than creating duplicates. */
export async function retryQueueJob(jobId: string, clientId: string): Promise<boolean> {
  const job = await prisma.queueJob.findFirst({ where: { id: jobId, clientId } });
  if (!job) return false;

  const settings = await getQueueSettings(clientId);
  if (settings.paused) return false;

  const contacts = await prisma.contact.findMany({
    where: { id: { in: job.contactIds }, clientId },
  });

  await prisma.queueJob.update({
    where: { id: jobId },
    data: { status: "processing", attempts: job.attempts + 1, lastRunAt: new Date() },
  });

  const result = await sendBatch(
    contacts.map((c: { id: string; phone: string; name: string | null }) => ({
      id: c.id,
      phone: c.phone,
      name: c.name,
    })),
    job.messageText,
    settings.messagesPerMinute,
    {
      clientId,
      queueJobId: job.id,
      campaignId: job.campaignId,
      campaignName: job.name,
      templateId: job.templateId,
      preview: job.messageText.slice(0, 200),
    }
  );

  const wholeBatchFailed = result.sent === 0 && contacts.length > 0;
  await prisma.queueJob.update({
    where: { id: jobId },
    data: {
      status: wholeBatchFailed ? "failed" : "completed",
      sentCount: result.sent,
      failedCount: result.failed,
      errorMessage: wholeBatchFailed ? result.lastError ?? "All messages in this batch failed." : null,
    },
  });

  return true;
}
