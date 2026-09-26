import "server-only";
import { prisma } from "@/lib/db";
import { fillTemplate } from "@/lib/utils";
import { enqueueAndProcess, buildPayloadForContact } from "@/lib/queueProcessor";
import { buildOutboundMessage, type TemplateLike } from "@/lib/whatsappMessage";
import { personalizeVariables } from "@/lib/personalize";
import { getAppOrigin } from "@/lib/appUrl";

/**
 * Runs one campaign: fetches its real audience and template, then sends it
 * through the real queue (lib/queueProcessor.ts — batching + rate limiting +
 * retryable QueueJob rows), and updates the campaign row with the actual
 * result. Safe to call for a campaign that's already running/completed — it
 * just re-sends (callers should avoid that, but this function itself won't
 * corrupt state).
 */
export async function runCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;

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

  const origin = getAppOrigin();

  // Campaigns don't currently collect any shared ({{2}}, {{3}}, ...) values
  // of their own — {{1}} still auto-fills per contact with their own name
  // (see lib/personalize.ts). Previously this used template.variables (the
  // *labels*, e.g. "Name") as if they were the fill-in values, which sent
  // the literal word "Name" to every contact instead of each person's real
  // name or an actual value — that's fixed here.
  const { preview } = buildOutboundMessage(
    {
      header: template.header ? fillTemplate(template.header, personalizeVariables([], {})) : null,
      body: fillTemplate(template.body, personalizeVariables([], {})),
      footer: template.footer ? fillTemplate(template.footer, personalizeVariables([], {})) : null,
      mediaKind: template.mediaKind,
      mediaUrl: template.mediaUrl,
      buttons: template.buttons,
    },
    origin
  );

  const result = await enqueueAndProcess({
    clientId: campaign.clientId,
    name: campaign.name,
    campaignId: campaign.id,
    contacts: contacts.map((c: { id: string; phone: string; name: string | null }) => ({
      id: c.id,
      phone: c.phone,
      name: c.name,
    })),
    templateId: template.id,
    templateName: template.name,
    buildPayload: (contact) => buildPayloadForContact(template as unknown as TemplateLike, [], contact, origin),
    preview,
  });

  if (result.paused) {
    // Leave it as "scheduled" so the scheduler picks it back up once the
    // queue is unpaused, instead of silently marking it done/failed.
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: campaign.scheduledAt ? "scheduled" : "draft" },
    });
    return;
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "completed", sentCount: result.sent, failedCount: result.failed },
  });
}
