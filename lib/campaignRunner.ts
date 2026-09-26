import "server-only";
import { prisma } from "@/lib/db";
import { fillTemplate } from "@/lib/utils";
import { enqueueAndProcess } from "@/lib/queueProcessor";
import { buildOutboundMessage } from "@/lib/whatsappMessage";
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

  const { payload, preview } = buildOutboundMessage(
    {
      header: template.header ? fillTemplate(template.header, template.variables) : null,
      body: fillTemplate(template.body, template.variables),
      footer: template.footer ? fillTemplate(template.footer, template.variables) : null,
      mediaKind: template.mediaKind,
      mediaUrl: template.mediaUrl,
      buttons: template.buttons,
    },
    getAppOrigin()
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
    payload,
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
