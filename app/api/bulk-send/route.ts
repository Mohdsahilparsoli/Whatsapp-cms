import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { fillTemplate } from "@/lib/utils";

/**
 * ⚠️ Same demo/testing scope as /api/whatsapp/send-test — one shared test
 * number from env vars, not yet a real per-client WhatsApp connection.
 *
 * Only Custom Templates (status "custom") can be used here — Meta-Approved
 * templates in this app are still mock data (data/campaigns.ts) and are not
 * real, registered Meta templates, so Meta would reject them. Sending a
 * plain-text version of a custom template only delivers to a recipient who
 * has messaged the test number in the last 24 hours (Meta's messaging
 * window rule) — same limitation as the Inbox "send real message" feature.
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const phoneNumberId = process.env.META_TEST_PHONE_NUMBER_ID;
  const accessToken = process.env.META_TEST_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return NextResponse.json(
      {
        error:
          "WhatsApp test credentials are not configured. Add META_TEST_PHONE_NUMBER_ID and META_TEST_ACCESS_TOKEN to .env.",
      },
      { status: 500 }
    );
  }

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

  const results: { contactId: string; name: string | null; phone: string; ok: boolean; error?: string }[] = [];

  for (const contact of contacts) {
    const to = contact.phone.replace(/\D/g, "");
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
      const data = await res.json();
      if (!res.ok) {
        results.push({
          contactId: contact.id,
          name: contact.name,
          phone: contact.phone,
          ok: false,
          error: data?.error?.message ?? "Meta rejected the message.",
        });
      } else {
        results.push({ contactId: contact.id, name: contact.name, phone: contact.phone, ok: true });
      }
    } catch {
      results.push({
        contactId: contact.id,
        name: contact.name,
        phone: contact.phone,
        ok: false,
        error: "Could not reach the WhatsApp API.",
      });
    }
    // Small gap between sends so we don't hammer the API in a tight loop.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const skipped = contactIds.length - contacts.length; // not opted-in, or not this client's
  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({ total: contactIds.length, sent, failed, skipped, results });
}
