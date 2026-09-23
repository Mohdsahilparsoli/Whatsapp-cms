import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/apiGuards";
import { formatRelativeTime } from "@/lib/utils";

export async function GET() {
  const unauthorized = await requireSuperAdmin();
  if (unauthorized) return unauthorized;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days, for "recent" lists
  const expiryCutoff = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

  const [clients, contactCounts, messageCounts, recentCampaignsRaw, recentlyAddedClients, recentCompletedCampaigns] =
    await Promise.all([
      prisma.client.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.contact.groupBy({ by: ["clientId"], _count: { id: true } }),
      prisma.messageRecord.groupBy({ by: ["clientId"], _count: { id: true } }),
      prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.client.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, createdAt: true },
      }),
      prisma.campaign.findMany({
        where: { status: "completed", updatedAt: { gte: since } },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, name: true, clientId: true, sentCount: true, failedCount: true, updatedAt: true },
      }),
    ]);

  const contactsByClient = new Map<string, number>(
    contactCounts.map((c: { clientId: string; _count: { id: number } }) => [c.clientId, c._count.id])
  );
  const messagesByClient = new Map<string, number>(
    messageCounts.map((c: { clientId: string; _count: { id: number } }) => [c.clientId, c._count.id])
  );
  const clientNameById = new Map(clients.map((c: { id: string; name: string }) => [c.id, c.name]));

  const active = clients.filter((c: { status: string }) => c.status === "active").length;
  const suspended = clients.filter((c: { status: string }) => c.status === "suspended").length;
  const expiring = clients.filter(
    (c: { expiryDate: Date; status: string }) =>
      c.status === "active" && c.expiryDate <= expiryCutoff && c.expiryDate >= new Date()
  ).length;
  const totalMessagesSent = Array.from(messagesByClient.values()).reduce(
    (sum: number, n: number) => sum + n,
    0
  );

  const clientUsage = clients.map(
    (c: { id: string; name: string; userId: string; expiryDate: Date; status: string }) => ({
      id: c.id,
      name: c.name,
      userId: c.userId,
      contacts: contactsByClient.get(c.id) ?? 0,
      messagesSent: messagesByClient.get(c.id) ?? 0,
      expiryDate: c.expiryDate.toISOString(),
      status: c.status,
    })
  );

  const recentCampaigns = recentCampaignsRaw.map(
    (c: {
      id: string;
      name: string;
      clientId: string;
      audienceSize: number;
      sentCount: number;
      status: string;
    }) => ({
      id: c.id,
      name: c.name,
      clientName: clientNameById.get(c.clientId) ?? "Unknown client",
      audienceSize: c.audienceSize,
      sentCount: c.sentCount,
      status: c.status,
    })
  );

  const activityItems = [
    ...recentlyAddedClients.map((c: { id: string; name: string; createdAt: Date }) => ({
      id: `client-${c.id}`,
      text: `New client "${c.name}" was added.`,
      time: formatRelativeTime(c.createdAt),
      at: c.createdAt.toISOString(),
    })),
    ...recentCompletedCampaigns.map(
      (c: { id: string; name: string; clientId: string; sentCount: number; failedCount: number; updatedAt: Date }) => ({
        id: `campaign-${c.id}`,
        text: `"${clientNameById.get(c.clientId) ?? "A client"}" finished campaign "${c.name}" — ${c.sentCount} sent, ${c.failedCount} failed.`,
        time: formatRelativeTime(c.updatedAt),
        at: c.updatedAt.toISOString(),
      })
    ),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 8);

  return NextResponse.json({
    totalClients: clients.length,
    activeClients: active,
    suspendedClients: suspended,
    expiringClients: expiring,
    totalMessagesSent,
    clientUsage,
    recentCampaigns,
    recentActivity: activityItems,
  });
}
