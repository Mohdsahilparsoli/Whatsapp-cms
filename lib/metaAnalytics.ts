import "server-only";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";

/**
 * Meta's OWN analytics for a client's WhatsApp Business Account — what Meta
 * counts as sent/delivered and what it bills — as opposed to the rest of
 * Reports, which is computed from this app's database. Two Graph API fields
 * on the WABA node (syntax per Meta's WhatsApp Analytics docs):
 *
 *   analytics         → sent / delivered per day (granularity DAY)
 *   pricing_analytics → volume + approximate cost per day, broken down by
 *                       pricing category (marketing, utility, service…) and
 *                       type (regular / free customer service / free entry
 *                       point), granularity DAILY
 *
 * Note Meta's two fields spell the daily granularity differently (DAY vs
 * DAILY). The cost figure is Meta's approximate charge in the account's own
 * billing currency (Meta doesn't return the currency in this response), and
 * is omitted entirely for WABAs on a Solution Partner's credit line.
 *
 * The two calls are independent: if one fails (e.g. missing permission) the
 * other's data is still returned alongside an error message for the failed one.
 */

export interface MetaAnalyticsDay {
  /** YYYY-MM-DD (UTC) */
  date: string;
  sent: number;
  delivered: number;
}

export interface MetaPricingRow {
  category: string;
  type: string;
  volume: number;
  cost: number;
}

export interface MetaAnalytics {
  days: number;
  daily: MetaAnalyticsDay[];
  totals: { sent: number; delivered: number; volume: number; cost: number };
  pricing: MetaPricingRow[];
  /** True when Meta returned no cost figures at all (shared credit line). */
  costHidden: boolean;
  errors: string[];
}

export type MetaAnalyticsOutcome =
  | { ok: true; analytics: MetaAnalytics }
  | { ok: false; error: string; status: number };

interface MessagingResponse {
  analytics?: { data_points?: { start: number; end: number; sent?: number; delivered?: number }[] };
  error?: { message?: string };
}

interface PricingResponse {
  pricing_analytics?: {
    data?: {
      data_points?: {
        start: number;
        end: number;
        pricing_category?: string;
        pricing_type?: string;
        volume?: number;
        cost?: number;
      }[];
    }[];
  };
  error?: { message?: string };
}

const DAY_SECONDS = 24 * 60 * 60;

async function graphGet<T>(url: string, accessToken: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) return { ok: false, error: data.error?.message ?? `Meta returned ${res.status}.` };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Could not reach Meta's API." };
  }
}

export async function fetchMetaAnalytics(clientId: string, days: number): Promise<MetaAnalyticsOutcome> {
  const credentials = await getWhatsAppCredentials(clientId);
  if (!credentials) {
    return { ok: false, status: 400, error: "No WhatsApp number available — connect one in WhatsApp Account Setup first." };
  }
  if (!credentials.wabaId) {
    return {
      ok: false,
      status: 400,
      error: "Meta analytics needs your WhatsApp Business Account ID — reconnect your account in WhatsApp Account Setup.",
    };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  // Whole UTC days: from midnight `days` ago up to the current hour.
  const end = nowSeconds - (nowSeconds % 3600);
  const start = end - (end % DAY_SECONDS) - days * DAY_SECONDS;
  const base = `https://graph.facebook.com/v25.0/${credentials.wabaId}`;

  const [messaging, pricing] = await Promise.all([
    graphGet<MessagingResponse>(
      `${base}?fields=analytics.start(${start}).end(${end}).granularity(DAY)`,
      credentials.accessToken
    ),
    graphGet<PricingResponse>(
      `${base}?fields=pricing_analytics.start(${start}).end(${end}).granularity(DAILY).dimensions(PRICING_CATEGORY,PRICING_TYPE)`,
      credentials.accessToken
    ),
  ]);

  const errors: string[] = [];
  if (!messaging.ok) errors.push(`Message counts: ${messaging.error}`);
  if (!pricing.ok) errors.push(`Billing: ${pricing.error}`);
  if (!messaging.ok && !pricing.ok) {
    return { ok: false, status: 502, error: errors.join(" · ") };
  }

  const daily: MetaAnalyticsDay[] = messaging.ok
    ? (messaging.data.analytics?.data_points ?? []).map((p) => ({
        date: new Date(p.start * 1000).toISOString().slice(0, 10),
        sent: p.sent ?? 0,
        delivered: p.delivered ?? 0,
      }))
    : [];

  const byKey = new Map<string, MetaPricingRow>();
  let sawCost = false;
  if (pricing.ok) {
    for (const group of pricing.data.pricing_analytics?.data ?? []) {
      for (const p of group.data_points ?? []) {
        const category = p.pricing_category ?? "UNKNOWN";
        const type = p.pricing_type ?? "UNKNOWN";
        const key = `${category}|${type}`;
        const row = byKey.get(key) ?? { category, type, volume: 0, cost: 0 };
        row.volume += p.volume ?? 0;
        if (typeof p.cost === "number") {
          row.cost += p.cost;
          sawCost = true;
        }
        byKey.set(key, row);
      }
    }
  }
  const pricingRows = [...byKey.values()].sort((a, b) => b.cost - a.cost || b.volume - a.volume);

  return {
    ok: true,
    analytics: {
      days,
      daily,
      totals: {
        sent: daily.reduce((n, d) => n + d.sent, 0),
        delivered: daily.reduce((n, d) => n + d.delivered, 0),
        volume: pricingRows.reduce((n, r) => n + r.volume, 0),
        cost: pricingRows.reduce((n, r) => n + r.cost, 0),
      },
      pricing: pricingRows,
      costHidden: pricing.ok && pricingRows.length > 0 && !sawCost,
      errors,
    },
  };
}
