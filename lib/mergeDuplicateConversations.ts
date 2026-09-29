import "server-only";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

/**
 * One real customer should only ever have one Conversation/chat thread in
 * the Inbox — same as real WhatsApp. Every place that creates or updates a
 * Conversation now writes the same normalizePhone() canonical value, so
 * going forward a campaign/bulk send and that same person's inbound reply
 * always land in the same thread. This merges any conversations that
 * already split apart *before* that fix shipped (a Contact typed as
 * "9818186876", Meta's webhook reporting the same person as
 * "919818186876" — two different Conversation.contactPhone strings for one
 * real number).
 *
 * Runs automatically every time the Inbox's conversation list loads (see
 * app/api/inbox/conversations/route.ts) — it's a cheap no-op once nothing
 * is left to merge, so there's no manual migration step for the merge
 * itself to ever go stale.
 */
export async function mergeDuplicateConversationsForClient(clientId: string): Promise<void> {
  const conversations = await prisma.conversation.findMany({ where: { clientId } });

  const groups = new Map<string, typeof conversations>();
  for (const convo of conversations) {
    const key = normalizePhone(convo.contactPhone);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(convo);
    else groups.set(key, [convo]);
  }

  for (const [canonicalPhone, group] of groups) {
    if (group.length === 1) {
      // Nothing to merge — just make sure its own contactPhone is already
      // the canonical form so future exact-match lookups (e.g. matching a
      // Contact's own phone) keep working.
      const only = group[0];
      if (only.contactPhone !== canonicalPhone) {
        await prisma.conversation
          .update({ where: { id: only.id }, data: { contactPhone: canonicalPhone } })
          .catch(() => {});
      }
      continue;
    }

    // Multiple rows for the same real number — keep the one with the most
    // recent activity as the surviving thread and fold the rest into it.
    const [primary, ...duplicates] = [...group].sort(
      (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
    );

    try {
      await prisma.$transaction([
        // Move every message over first, so no history is lost.
        ...duplicates.map((dup) =>
          prisma.chatMessage.updateMany({
            where: { conversationId: dup.id },
            data: { conversationId: primary.id },
          })
        ),
        // Delete the duplicate rows before renaming primary to the
        // canonical phone — avoids a transient unique-constraint clash if
        // one of the duplicates already held that exact string.
        ...duplicates.map((dup) => prisma.conversation.delete({ where: { id: dup.id } })),
        prisma.conversation.update({
          where: { id: primary.id },
          data: {
            contactPhone: canonicalPhone,
            unreadCount: group.reduce((sum, c) => sum + c.unreadCount, 0),
            contactName: primary.contactName ?? group.find((c) => c.contactName)?.contactName ?? null,
            lastMessageAt: group.reduce(
              (latest, c) => (c.lastMessageAt > latest ? c.lastMessageAt : latest),
              primary.lastMessageAt
            ),
          },
        }),
      ]);
    } catch (err) {
      console.error("mergeDuplicateConversationsForClient: failed to merge", canonicalPhone, err);
    }
  }
}
