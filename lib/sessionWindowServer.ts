import "server-only";
import { prisma } from "@/lib/db";
import { getSessionWindow, type SessionWindow } from "@/lib/sessionWindow";

/** The 24h window for one client's conversation with `phone`, from the
 * customer's last real inbound message. No conversation = closed. */
export async function getConversationWindow(clientId: string, phone: string): Promise<SessionWindow> {
  const lastInbound = await prisma.chatMessage.findFirst({
    where: { clientId, direction: "inbound", conversation: { contactPhone: phone } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return getSessionWindow(lastInbound?.createdAt ?? null);
}
