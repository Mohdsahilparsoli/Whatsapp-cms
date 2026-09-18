import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { toPublicCampaign } from "@/lib/campaignMapper";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.campaign.findFirst({ where: { id, clientId: auth.clientId } });
  if (!existing) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  if (existing.status !== "scheduled") {
    return NextResponse.json({ error: "Only scheduled campaigns can be cancelled." }, { status: 400 });
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: "cancelled", scheduledAt: null },
  });

  return NextResponse.json({ campaign: toPublicCampaign(campaign) });
}
