import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { toPublicCampaign } from "@/lib/campaignMapper";
import { runCampaign } from "@/lib/campaignRunner";
import { ensureCampaignSchedulerStarted } from "@/lib/campaignScheduler";
import { normalizeCampaignInput, validateCampaignInput, type CampaignInputBody } from "@/lib/campaignValidation";

// Starts the in-process scheduler the first time this module is loaded by
// the running server — see lib/campaignScheduler.ts for what that means.
ensureCampaignSchedulerStarted();

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const campaigns = await prisma.campaign.findMany({
    where: { clientId: auth.clientId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ campaigns: campaigns.map(toPublicCampaign) });
}

export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: CampaignInputBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const c = normalizeCampaignInput(body);
  const errors = validateCampaignInput(c);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const template = await prisma.customTemplate.findFirst({
    where: { id: c.templateId, clientId: auth.clientId },
  });
  if (!template) {
    return NextResponse.json({ errors: { template: "Template not found." } }, { status: 404 });
  }
  if (c.mode !== "draft" && template.status !== "custom") {
    return NextResponse.json(
      { errors: { template: "Only saved (non-draft) custom templates can be sent." } },
      { status: 400 }
    );
  }

  const audienceSize = await prisma.contact.count({
    where: {
      clientId: auth.clientId,
      consent: "opted_in",
      ...(c.audienceTag !== "all" ? { tags: { has: c.audienceTag } } : {}),
    },
  });

  const campaign = await prisma.campaign.create({
    data: {
      clientId: auth.clientId,
      name: c.name,
      audienceTag: c.audienceTag,
      templateId: template.id,
      templateName: template.name,
      audienceSize,
      status: c.mode === "schedule" ? "scheduled" : c.mode === "now" ? "sending" : "draft",
      scheduledAt: c.mode === "schedule" ? c.scheduledAt : null,
    },
  });

  if (c.mode === "now") {
    await runCampaign(campaign.id);
    const finished = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    return NextResponse.json({ campaign: toPublicCampaign(finished ?? campaign) }, { status: 201 });
  }

  return NextResponse.json({ campaign: toPublicCampaign(campaign) }, { status: 201 });
}
