import "server-only";
import { prisma } from "@/lib/db";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";

/**
 * Meta's own quality rating + messaging-limit tier, turned into real
 * rules for campaign / bulk sends (the queue). Before this, both were only
 * *displayed* on the WhatsApp Account Setup page; nothing stopped a client
 * from blasting a number Meta had already flagged, which is exactly how
 * numbers get restricted or banned.
 *
 *  - RED rating    → marketing sends are blocked outright (Meta is about to
 *                    restrict the number; more sends make it worse).
 *  - YELLOW rating → sends are slowed to a conservative pace.
 *  - Tier limit    → a send that would reach more NEW people in 24h than the
 *                    number's tier allows is refused up front, instead of
 *                    half-sending and failing the rest with Meta errors.
 *
 * Only applies to a client's OWN connected number. The shared test number
 * has its own tiny Meta-side limits and no AccountSetup row to track.
 * Manual Inbox replies are never gated: they're customer-service replies
 * inside the 24h window, not business-initiated conversations.
 */

/** Distinct people a number may START conversations with per rolling 24h,
 * by Meta messaging-limit tier. */
const TIER_LIMITS: Record<string, number | null> = {
  TIER_NOT_SET: 250,
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_2K: 2_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: null, // no cap
};

/** Pace for a YELLOW-rated number — well below the usual setting. */
const YELLOW_MAX_PER_MINUTE = 20;

/** How long a fetched rating/tier is trusted before asking Meta again. */
const REFRESH_AFTER_MS = 10 * 60 * 1000;

export interface AccountHealth {
  qualityRating: string | null;
  messagingTier: string | null;
}

export interface SendPolicy {
  allowed: boolean;
  /** Human-readable reason, set when `allowed` is false. */
  reason?: string;
  /** Cap on messages/minute imposed by quality rating, or null for none. */
  maxPerMinute: number | null;
  qualityRating: string | null;
  messagingTier: string | null;
}

const NEUTRAL: SendPolicy = { allowed: true, maxPerMinute: null, qualityRating: null, messagingTier: null };

/**
 * Returns the client's connected-number rating + tier, re-fetching from
 * Meta when the stored copy is older than REFRESH_AFTER_MS (or `force`).
 * A failed Meta call is non-fatal: the last stored values are used so a
 * Meta read hiccup never blocks sending on its own.
 */
export async function refreshAccountHealth(clientId: string, force = false): Promise<AccountHealth | null> {
  const account = await prisma.whatsAppAccount.findUnique({ where: { clientId } });
  if (!account?.connected || !account.phoneNumberId) return null;

  const stored: AccountHealth = { qualityRating: account.qualityRating, messagingTier: account.messagingTier };
  const fresh = account.qualityCheckedAt && Date.now() - account.qualityCheckedAt.getTime() < REFRESH_AFTER_MS;
  if (fresh && !force) return stored;

  const credentials = await getWhatsAppCredentials(clientId);
  if (!credentials || credentials.source !== "client") return stored;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${credentials.phoneNumberId}?fields=quality_rating,messaging_limit_tier`,
      { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
    );
    if (!res.ok) return stored;
    const data: { quality_rating?: string; messaging_limit_tier?: string } = await res.json();
    const next: AccountHealth = {
      qualityRating: data.quality_rating ?? stored.qualityRating,
      messagingTier: data.messaging_limit_tier ?? stored.messagingTier,
    };
    await prisma.whatsAppAccount.update({
      where: { clientId },
      data: { ...next, qualityCheckedAt: new Date() },
    });
    return next;
  } catch {
    return stored;
  }
}

/** Distinct people already messaged by a campaign/bulk send in the last 24h. */
async function recipientsMessagedLast24h(clientId: string): Promise<Set<string>> {
  const rows = await prisma.messageRecord.findMany({
    where: {
      clientId,
      queueJobId: { not: null },
      status: { not: "failed" },
      sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    distinct: ["recipientPhone"],
    select: { recipientPhone: true },
  });
  return new Set(rows.map((r: { recipientPhone: string }) => r.recipientPhone));
}

/**
 * Decides whether a campaign/bulk send to `phones` (already normalized) may
 * go out right now, and how fast.
 */
export async function getSendPolicy(clientId: string, phones: string[]): Promise<SendPolicy> {
  const credentials = await getWhatsAppCredentials(clientId);
  if (!credentials || credentials.source !== "client") return NEUTRAL;

  const health = await refreshAccountHealth(clientId);
  if (!health) return NEUTRAL;

  const rating = health.qualityRating?.toUpperCase() ?? null;
  const tier = health.messagingTier?.toUpperCase() ?? null;
  const base = { qualityRating: rating, messagingTier: tier };

  if (rating === "RED") {
    return {
      ...base,
      allowed: false,
      maxPerMinute: null,
      reason:
        "Your WhatsApp number's quality rating is RED (low), so campaign sending is paused to protect it from a Meta restriction. Send only to opted-in contacts and avoid blocks/reports — the rating recovers on its own, and sending unlocks again once it's back to YELLOW or GREEN.",
    };
  }

  const limit = tier && tier in TIER_LIMITS ? TIER_LIMITS[tier] : undefined;
  if (typeof limit === "number") {
    const already = await recipientsMessagedLast24h(clientId);
    const newPeople = new Set(phones.filter((p) => !already.has(p))).size;
    const remaining = Math.max(limit - already.size, 0);
    if (newPeople > remaining) {
      return {
        ...base,
        allowed: false,
        maxPerMinute: null,
        reason: `This send reaches ${newPeople} new people, but your number's messaging limit (${limit.toLocaleString("en-IN")} people per 24 hours) only has room for ${remaining} more right now. Send to fewer contacts, or try again later — the limit rolls over every 24 hours.`,
      };
    }
  }

  return {
    ...base,
    allowed: true,
    maxPerMinute: rating === "YELLOW" ? YELLOW_MAX_PER_MINUTE : null,
  };
}
