import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { toPublicCampaign } from "@/lib/campaignMapper";
import { runCampaign } from "@/lib/campaignRunner";
import { normalizeCampaignInput, validateCampaignInput, type CampaignInputBody } from "@/lib/campaignValidation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const campaign = await prisma.campaign.findFirst({ where: { id, clientId: auth.clientId } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  return NextResponse.json({ campaign: toPublicCampaign(campaign) });
}

export async function PUT(request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.campaign.findFirst({ where: { id, clientId: auth.clientId } });
  if (!existing) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  if (existing.status !== "draft" && existing.status !== "scheduled") {
    return NextResponse.json(
      { error: "Only draft or scheduled campaigns can be edited." },
      { status: 400 }
    );
  }

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

  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
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
    const finished = await prisma.campaign.findUnique({ where: { id } });
    return NextResponse.json({ campaign: toPublicCampaign(finished ?? campaign) });
  }

  return NextResponse.json({ campaign: toPublicCampaign(campaign) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.campaign.findFirst({ where: { id, clientId: auth.clientId } });
  if (!existing) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  if (existing.status === "sending") {
    return NextResponse.json(
      { error: "This campaign is sending right now — wait for it to finish before deleting." },
      { status: 400 }
    );
  }

  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
