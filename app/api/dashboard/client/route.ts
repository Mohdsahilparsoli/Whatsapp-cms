import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { aggregateTotals } from "@/lib/reportsAggregate";
import { toPublicCampaign } from "@/lib/campaignMapper";
import { toPublicMessageRecord } from "@/lib/messageMapper";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const [totalContacts, activeCampaigns, recentCampaigns, allRecords, recentMessages] =
    await Promise.all([
      prisma.contact.count({ where: { clientId: auth.clientId } }),
      prisma.campaign.count({
        where: { clientId: auth.clientId, status: { in: ["scheduled", "sending"] } },
      }),
      prisma.campaign.findMany({
        where: { clientId: auth.clientId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.messageRecord.findMany({
        where: { clientId: auth.clientId },
        select: { status: true, createdAt: true, campaignId: true, campaignName: true },
      }),
      prisma.messageRecord.findMany({
        where: { clientId: auth.clientId },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
    ]);

  return NextResponse.json({
    totalContacts,
    activeCampaigns,
    totals: aggregateTotals(allRecords),
    recentCampaigns: recentCampaigns.map(toPublicCampaign),
    recentMessages: recentMessages.map(toPublicMessageRecord),
  });
}
