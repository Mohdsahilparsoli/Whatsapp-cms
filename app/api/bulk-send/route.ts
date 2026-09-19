import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { fillTemplate } from "@/lib/utils";
import { enqueueAndProcess } from "@/lib/queueProcessor";

/**
 * ⚠️ Same demo/testing scope as /api/whatsapp/send-test — one shared test
 * number from env vars, not yet a real per-client WhatsApp connection.
 *
 * Only Custom Templates (status "custom") can be used here — Meta-Approved
 * templates in this app are still mock data (data/campaigns.ts) and are not
 * real, registered Meta templates, so Meta would reject them. Sending goes
 * through the real queue (lib/queueProcessor.ts) — batched and rate-limited
 * per the client's Queue & Rate Limiting settings, producing real,
 * retryable QueueJob rows visible on that page.
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { contactIds?: string[]; templateId?: string; variables?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const contactIds = Array.isArray(body.contactIds) ? body.contactIds : [];
  const templateId = body.templateId;
  const variables = Array.isArray(body.variables) ? body.variables : [];

  if (contactIds.length === 0) {
    return NextResponse.json({ error: "Select at least one contact." }, { status: 400 });
  }
  if (contactIds.length > 200) {
    return NextResponse.json({ error: "You can send to at most 200 contacts at once." }, { status: 400 });
  }
  if (!templateId) {
    return NextResponse.json({ error: "Select a template." }, { status: 400 });
  }

  const template = await prisma.customTemplate.findFirst({
    where: { id: templateId, clientId: auth.clientId },
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
  if (template.status !== "custom") {
    return NextResponse.json(
      { error: "Only saved (non-draft) custom templates can be sent." },
      { status: 400 }
    );
  }

  // Only real, opted-in contacts belonging to this client — never someone
  // else's, and never a contact who opted out, regardless of what the
  // client sent us.
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, clientId: auth.clientId, consent: "opted_in" },
  });

  const messageText = [
    template.header ? fillTemplate(template.header, variables) : null,
    fillTemplate(template.body, variables),
    template.footer ? fillTemplate(template.footer, variables) : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await enqueueAndProcess({
    clientId: auth.clientId,
    name: `Bulk send — ${template.name}`,
    contacts: contacts.map((c: { id: string; phone: string; name: string | null }) => ({
      id: c.id,
      phone: c.phone,
      name: c.name,
    })),
    templateId: template.id,
    templateName: template.name,
    messageText,
  });

  if (result.paused) {
    return NextResponse.json(
      { error: "The queue is paused — resume it from Queue & Rate Limiting before sending." },
      { status: 409 }
    );
  }

  const skipped = contactIds.length - contacts.length; // not opted-in, or not this client's
  return NextResponse.json({
    total: contactIds.length,
    sent: result.sent,
    failed: result.failed,
    skipped,
  });
}
