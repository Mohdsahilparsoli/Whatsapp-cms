import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { aggregateTotals, campaignPerformance, dailyBuckets } from "@/lib/reportsAggregate";

export async function GET(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const campaignId = url.searchParams.get("campaignId");

  const createdAtFilter: { gte?: Date; lte?: Date } = {};
  if (from) createdAtFilter.gte = new Date(`${from}T00:00:00`);
  if (to) createdAtFilter.lte = new Date(`${to}T23:59:59`);

  const [records, recent, campaigns] = await Promise.all([
    prisma.messageRecord.findMany({
      where: {
        clientId: auth.clientId,
        ...(campaignId && campaignId !== "all" ? { campaignId } : {}),
        ...(from || to ? { createdAt: createdAtFilter } : {}),
      },
      select: { status: true, createdAt: true, campaignId: true, campaignName: true },
    }),
    // The daily chart is always "the last 7 days", independent of the
    // range filter above — fetched separately so changing the date filter
    // doesn't also change what the chart shows.
    prisma.messageRecord.findMany({
      where: {
        clientId: auth.clientId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { status: true, createdAt: true, campaignId: true, campaignName: true },
    }),
    prisma.campaign.findMany({
      where: { clientId: auth.clientId },
      select: { id: true, name: true, status: true },
    }),
  ]);

  const campaignStatus = new Map<string, string>(
    campaigns.map((c: { id: string; status: string }) => [c.id, c.status])
  );

  return NextResponse.json({
    totals: aggregateTotals(records),
    dailyStats: dailyBuckets(recent, 7),
    campaignPerformance: campaignPerformance(records, campaignStatus),
    campaigns: campaigns.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })),
  });
}
