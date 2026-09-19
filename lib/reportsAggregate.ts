import "server-only";

interface RecordLike {
  status: string;
  createdAt: Date;
  campaignId: string | null;
  campaignName: string | null;
}

export function aggregateTotals(records: RecordLike[]) {
  const totals = { recipients: records.length, sent: 0, delivered: 0, read: 0, failed: 0 };
  for (const r of records) {
    if (r.status === "failed") {
      totals.failed += 1;
      continue;
    }
    totals.sent += 1;
    if (r.status === "delivered" || r.status === "read") totals.delivered += 1;
    if (r.status === "read") totals.read += 1;
  }
  return totals;
}

/** Buckets records into the last `days` calendar days (today inclusive),
 * regardless of the caller's own date-range filter — matches the chart's
 * fixed "last N days" framing. */
export function dailyBuckets(records: RecordLike[], days = 7) {
  const now = new Date();
  const buckets: { label: string; dateKey: string; sent: number; delivered: number; read: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    buckets.push({
      label: d.toLocaleDateString("en-IN", { weekday: "short" }),
      dateKey,
      sent: 0,
      delivered: 0,
      read: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.dateKey, b]));

  for (const r of records) {
    const bucket = byKey.get(r.createdAt.toISOString().slice(0, 10));
    if (!bucket || r.status === "failed") continue;
    bucket.sent += 1;
    if (r.status === "delivered" || r.status === "read") bucket.delivered += 1;
    if (r.status === "read") bucket.read += 1;
  }

  return buckets;
}

export interface CampaignPerfRow {
  key: string;
  name: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  status: string;
}

/** Groups records by campaign (or "Direct send" for Bulk Sender sends,
 * which have no campaignId). `campaignStatus` supplies each real campaign's
 * actual status; anything without an entry (direct sends) is labeled
 * "completed", since by the time a record exists the send already ran. */
export function campaignPerformance(
  records: RecordLike[],
  campaignStatus: Map<string, string>
): CampaignPerfRow[] {
  const groups = new Map<string, CampaignPerfRow>();

  for (const r of records) {
    const key = r.campaignId ?? r.campaignName ?? "direct";
    const name = r.campaignName ?? "Direct send";
    if (!groups.has(key)) {
      groups.set(key, { key, name, sent: 0, delivered: 0, read: 0, failed: 0, status: "completed" });
    }
    const g = groups.get(key)!;
    if (r.status === "failed") {
      g.failed += 1;
    } else {
      g.sent += 1;
      if (r.status === "delivered" || r.status === "read") g.delivered += 1;
      if (r.status === "read") g.read += 1;
    }
  }

  for (const g of groups.values()) {
    if (g.key !== "direct" && campaignStatus.has(g.key)) {
      g.status = campaignStatus.get(g.key)!;
    }
  }

  return Array.from(groups.values());
}
