import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { aggregateTotals } from "@/lib/reportsAggregate";
import { toPublicCampaign } from "@/lib/campaignMapper";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const [totalContacts, activeCampaigns, recentCampaigns, allRecords, recentChats, unreadConversations] =
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
      // "Recent chats" for the dashboard card — one row per real WhatsApp
      // contact (Conversation is already unique per contact, so this can
      // never show the same person twice the way a flat per-message list
      // could), each showing their TOTAL message count, not just how many
      // recent ones happened to be in a fixed-size slice. Clicking a row
      // goes straight into that conversation in the Inbox.
      prisma.conversation.findMany({
        where: { clientId: auth.clientId },
        orderBy: { lastMessageAt: "desc" },
        take: 20,
        select: {
          id: true,
          contactName: true,
          contactPhone: true,
          lastMessageAt: true,
          _count: { select: { messages: true } },
        },
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
    recentChats: recentChats.map(
      (c: {
        id: string;
        contactName: string | null;
        contactPhone: string;
        lastMessageAt: Date;
        _count: { messages: number };
      }) => ({
        id: c.id,
        contactName: c.contactName,
        contactPhone: c.contactPhone,
        messageCount: c._count.messages,
        lastMessageAt: c.lastMessageAt.toISOString(),
      })
    ),
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
