import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/apiGuards";
import { aggregateTotals, dailyBuckets } from "@/lib/reportsAggregate";

export async function GET(request: Request) {
  const unauthorized = await requireSuperAdmin();
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const createdAtFilter: { gte?: Date; lte?: Date } = {};
  if (from) createdAtFilter.gte = new Date(`${from}T00:00:00`);
  if (to) createdAtFilter.lte = new Date(`${to}T23:59:59`);

  const [records, recent, clients] = await Promise.all([
    prisma.messageRecord.findMany({
      where: from || to ? { createdAt: createdAtFilter } : {},
      select: { status: true, createdAt: true, clientId: true, campaignId: true, campaignName: true },
    }),
    prisma.messageRecord.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { status: true, createdAt: true, campaignId: true, campaignName: true },
    }),
    prisma.client.findMany({ select: { id: true, name: true } }),
  ]);

  const clientNames = new Map(clients.map((c: { id: string; name: string }) => [c.id, c.name]));
  const volumeByClient = new Map<string, number>();
  for (const r of records as { clientId: string }[]) {
    volumeByClient.set(r.clientId, (volumeByClient.get(r.clientId) ?? 0) + 1);
  }

  const topClients = Array.from(volumeByClient.entries())
    .map(([clientId, count]) => ({ clientId, name: clientNames.get(clientId) ?? "Unknown client", count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return NextResponse.json({
    totals: aggregateTotals(records),
    dailyStats: dailyBuckets(recent, 7),
    topClients,
  });
}
