import "server-only";
import { prisma } from "@/lib/db";
import { fillTemplate } from "@/lib/utils";

/**
 * Runs one campaign: fetches its real audience and template, sends via
 * Meta's Graph API (same shared test-number credentials as
 * /api/whatsapp/send-test and /api/bulk-send — see those files for why this
 * is a real-but-limited implementation), and updates the campaign row with
 * the actual result. Safe to call for a campaign that's already
 * running/completed — it just re-sends (callers should avoid that, but this
 * function itself won't corrupt state).
 */
export async function runCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;

  const phoneNumberId = process.env.META_TEST_PHONE_NUMBER_ID;
  const accessToken = process.env.META_TEST_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "failed" },
    });
    return;
  }

  const template = await prisma.customTemplate.findFirst({
    where: { id: campaign.templateId, clientId: campaign.clientId },
  });
  if (!template || template.status !== "custom") {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "failed" },
    });
    return;
  }

  const contacts = await prisma.contact.findMany({
    where: {
      clientId: campaign.clientId,
      consent: "opted_in",
      ...(campaign.audienceTag && campaign.audienceTag !== "all"
        ? { tags: { has: campaign.audienceTag } }
        : {}),
    },
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "sending", audienceSize: contacts.length },
  });

  const messageText = [
    template.header ? fillTemplate(template.header, template.variables) : null,
    fillTemplate(template.body, template.variables),
    template.footer ? fillTemplate(template.footer, template.variables) : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  let sent = 0;
  let failed = 0;

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
      if (res.ok) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
    // Small gap between sends so we don't hammer the API in a tight loop.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "completed", sentCount: sent, failedCount: failed },
  });
}
