import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionAdminId } from "@/lib/adminSession";
import { getSessionClientId } from "@/lib/session";
import { formatRelativeTime } from "@/lib/utils";

interface NotificationItem {
  id: string;
  text: string;
  time: string;
  at: string;
}

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET() {
  const clientId = await getSessionClientId();
  if (clientId) {
    const since = new Date(Date.now() - LOOKBACK_MS);

    const [completedCampaigns, failedJobs, pendingDrafts] = await Promise.all([
      prisma.campaign.findMany({
        where: { clientId, status: "completed", updatedAt: { gte: since } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.queueJob.findMany({
        where: { clientId, status: "failed", updatedAt: { gte: since } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.campaign.count({ where: { clientId, status: "draft" } }),
    ]);

    const items: NotificationItem[] = [
      ...completedCampaigns.map(
        (c: { id: string; name: string; sentCount: number; failedCount: number; updatedAt: Date }) => ({
          id: `campaign-${c.id}`,
          text: `Campaign "${c.name}" finished sending — ${c.sentCount} sent, ${c.failedCount} failed.`,
          time: formatRelativeTime(c.updatedAt),
          at: c.updatedAt.toISOString(),
        })
      ),
      ...failedJobs.map((j: { id: string; name: string; failedCount: number; updatedAt: Date }) => ({
        id: `job-${j.id}`,
        text: `A batch for "${j.name}" failed (${j.failedCount} messages) — retry it from Queue & Rate Limiting.`,
        time: formatRelativeTime(j.updatedAt),
        at: j.updatedAt.toISOString(),
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    if (pendingDrafts > 0) {
      items.push({
        id: "drafts",
        text: `You have ${pendingDrafts} draft campaign${pendingDrafts === 1 ? "" : "s"} waiting to be sent.`,
        time: "",
        at: new Date(0).toISOString(),
      });
    }

    return NextResponse.json({ notifications: items.slice(0, 8) });
  }

  const adminId = await getSessionAdminId();
  if (adminId) {
    const since = new Date(Date.now() - LOOKBACK_MS);
    const newClients = await prisma.client.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, createdAt: true },
    });

    const items: NotificationItem[] = newClients.map((c: { id: string; name: string; createdAt: Date }) => ({
      id: `client-${c.id}`,
      text: `New client "${c.name}" was added.`,
      time: formatRelativeTime(c.createdAt),
      at: c.createdAt.toISOString(),
    }));

    return NextResponse.json({ notifications: items });
  }

  return NextResponse.json({ notifications: [] });
}
