import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { fillTemplate } from "@/lib/utils";
import { advancedTemplateBlock } from "@/lib/templateKinds";
import { enqueueAndProcess, buildPayloadForContact } from "@/lib/queueProcessor";
import { buildOutboundMessage, type TemplateLike } from "@/lib/whatsappMessage";
import { personalizeVariables } from "@/lib/personalize";

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
  const kindBlock = advancedTemplateBlock(template);
  if (kindBlock) return NextResponse.json({ error: kindBlock }, { status: 400 });

  // Only real, opted-in contacts belonging to this client — never someone
  // else's, and never a contact who opted out, regardless of what the
  // client sent us.
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, clientId: auth.clientId, consent: "opted_in" },
  });

  const origin = new URL(request.url).origin;
  const fmt = template.parameterFormat === "named" ? "named" : "positional";

  // {{1}} always auto-fills with each contact's own name (see
  // lib/personalize.ts) — "there" here is just for the stored preview
  // text, since the real send builds a fresh, personalized payload per
  // contact below (buildPayloadForContact), not this one shared copy.
  const { preview } = buildOutboundMessage(
    {
      header: template.header ? fillTemplate(template.header, personalizeVariables(variables, {}), fmt, template.variables) : null,
      body: fillTemplate(template.body, personalizeVariables(variables, {}), fmt, template.variables),
      footer: template.footer ? fillTemplate(template.footer, personalizeVariables(variables, {}), fmt, template.variables) : null,
      mediaKind: template.mediaKind,
      mediaUrl: template.mediaUrl,
      buttons: template.buttons,
    },
    origin
  );

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
    buildPayload: (contact) => buildPayloadForContact(template as unknown as TemplateLike, variables, contact, origin),
    preview,
    mediaKind: template.mediaKind,
    mediaUrl: template.mediaUrl,
    mediaFileName: template.mediaFileName,
  });

  if (result.paused) {
    return NextResponse.json(
      { error: "The queue is paused — resume it from Queue & Rate Limiting before sending." },
      { status: 409 }
    );
  }

  if (result.blocked) {
    // Meta quality rating / messaging-tier gate (lib/sendPolicy.ts).
    return NextResponse.json({ error: result.blocked }, { status: 429 });
  }

  const skipped = contactIds.length - contacts.length; // not opted-in, or not this client's
  return NextResponse.json({
    total: contactIds.length,
    sent: result.sent,
    failed: result.failed,
    skipped,
  });
}
