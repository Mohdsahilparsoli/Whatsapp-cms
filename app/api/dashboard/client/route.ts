import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { aggregateTotals } from "@/lib/reportsAggregate";
import { toPublicCampaign } from "@/lib/campaignMapper";
import { toPublicMessageRecord } from "@/lib/messageMapper";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const [totalContacts, activeCampaigns, recentCampaigns, allRecords, recentMessages, unreadConversations] =
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
      // Real unread WhatsApp replies for the "New messages" urgent card. A
      // conversation currently open in the Inbox is kept at unreadCount 0 in
      // real time (see the Inbox page's active-conversation read polling),
      // so it drops out of this list the moment someone is looking at it.
      prisma.conversation.findMany({
        where: { clientId: auth.clientId, unreadCount: { gt: 0 } },
        orderBy: { lastMessageAt: "desc" },
        take: 5,
        select: { id: true, contactName: true, contactPhone: true, unreadCount: true, lastMessageAt: true },
      }),
    ]);

  return NextResponse.json({
    totalContacts,
    activeCampaigns,
    totals: aggregateTotals(allRecords),
    recentCampaigns: recentCampaigns.map(toPublicCampaign),
    recentMessages: recentMessages.map(toPublicMessageRecord),
    unreadMessages: {
      total: unreadConversations.reduce(
        (sum: number, c: { unreadCount: number }) => sum + c.unreadCount,
        0
      ),
      conversations: unreadConversations.map(
        (c: { id: string; contactName: string | null; contactPhone: string; unreadCount: number; lastMessageAt: Date }) => ({
          id: c.id,
          contactName: c.contactName,
          contactPhone: c.contactPhone,
          unreadCount: c.unreadCount,
          lastMessageAt: c.lastMessageAt.toISOString(),
        })
      ),
    },
  });
}
