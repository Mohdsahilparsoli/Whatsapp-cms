"use client";

import { useEffect, useMemo, useState } from "react";
import Card, { CardHeader } from "@/components/ui/Card";
import ChartCard from "@/components/ui/ChartCard";
import FilterDropdown from "@/components/ui/FilterDropdown";
import LoadingState from "@/components/ui/LoadingState";
import InlineAlert from "@/components/ui/InlineAlert";
import { formatNumber } from "@/lib/utils";

interface MetaAnalyticsData {
  days: number;
  daily: { date: string; sent: number; delivered: number }[];
  totals: { sent: number; delivered: number; volume: number; cost: number };
  pricing: { category: string; type: string; volume: number; cost: number }[];
  costHidden: boolean;
  errors: string[];
}

const RANGE_OPTIONS = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
];

const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: "Marketing",
  MARKETING_LITE: "Marketing (lite)",
  UTILITY: "Utility",
  AUTHENTICATION: "Authentication",
  AUTHENTICATION_INTERNATIONAL: "Authentication (international)",
  SERVICE: "Service",
  REFERRAL_CONVERSION: "Referral conversion",
};

const TYPE_LABELS: Record<string, string> = {
  REGULAR: "Paid",
  FREE_CUSTOMER_SERVICE: "Free — customer service window",
  FREE_ENTRY_POINT: "Free — entry point",
};

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Meta's own numbers for the connected WhatsApp Business Account — what
 * Meta counts as sent/delivered and what it bills — next to the rest of
 * Reports, which is computed from this app's own database. Fetched live
 * from Meta (app/api/reports/meta-analytics).
 */
export default function MetaAnalyticsCard() {
  const [days, setDays] = useState("30");
  const [data, setData] = useState<MetaAnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetch(`/api/reports/meta-analytics?days=${days}`)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setData(null);
          setError(body.error ?? "Could not load Meta analytics.");
        } else {
          setData(body);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach the server.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  // 90 individual day-bars is unreadable — group longer ranges by week.
  const chartData = useMemo(() => {
    if (!data) return [];
    const groupSize = data.days > 30 ? 7 : 1;
    const groups: { label: string; sent: number; delivered: number }[] = [];
    for (let i = 0; i < data.daily.length; i += groupSize) {
      const slice = data.daily.slice(i, i + groupSize);
      groups.push({
        label: formatDay(slice[0].date),
        sent: slice.reduce((n, d) => n + d.sent, 0),
        delivered: slice.reduce((n, d) => n + d.delivered, 0),
      });
    }
    return groups.map((g) => ({
      label: g.label,
      values: [
        { key: "Sent", value: g.sent, color: "#6366f1" },
        { key: "Delivered", value: g.delivered, color: "#10b981" },
      ],
    }));
  }, [data]);

  return (
    <div className="mt-6 space-y-5">
      <Card>
        <CardHeader
          title="Meta analytics & billing"
          description="Straight from Meta for your WhatsApp Business Account — separate from the campaign reports above, which come from this app's own records."
          action={<FilterDropdown label="Range" value={days} onChange={setDays} options={RANGE_OPTIONS} />}
        />
        {loading ? (
          <LoadingState rows={3} label="Loading Meta analytics" />
        ) : error ? (
          <div className="px-5 py-5">
            <InlineAlert tone="error">{error}</InlineAlert>
          </div>
        ) : data ? (
          <div className="px-5 py-4">
            {data.errors.length > 0 && (
              <InlineAlert tone="error" className="mb-4">
                {data.errors.join(" · ")}
              </InlineAlert>
            )}
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Sent (Meta)", value: formatNumber(data.totals.sent) },
                { label: "Delivered (Meta)", value: formatNumber(data.totals.delivered) },
                { label: "Billable-category messages", value: formatNumber(data.totals.volume) },
                {
                  label: "Approx. cost",
                  value: data.costHidden ? "Not available" : data.totals.cost.toLocaleString("en-IN", { maximumFractionDigits: 2 }),
                },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-200 px-4 py-3">
                  <dt className="text-xs text-slate-500">{item.label}</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900">{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-slate-400">
              Cost is Meta&apos;s approximate charge in your account&apos;s billing currency
              {data.costHidden ? " — Meta doesn't report it for accounts on a partner's credit line." : "."}
            </p>
          </div>
        ) : null}
      </Card>

      {!loading && !error && data && chartData.length > 0 && (
        <ChartCard
          title={data.days > 30 ? "Messages per week (Meta)" : "Messages per day (Meta)"}
          data={chartData}
          legend={[
            { key: "sent", label: "Sent", color: "#6366f1" },
            { key: "delivered", label: "Delivered", color: "#10b981" },
          ]}
        />
      )}

      {!loading && !error && data && (
        <Card>
          <CardHeader title="Cost breakdown" description="By Meta's pricing category and type" />
          {data.pricing.length === 0 ? (
            <p className="px-5 py-5 text-sm text-slate-400">No billing data for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Category</th>
                    <th className="px-5 py-2.5 font-medium">Type</th>
                    <th className="px-5 py-2.5 text-right font-medium">Messages</th>
                    <th className="px-5 py-2.5 text-right font-medium">Approx. cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.pricing.map((row) => (
                    <tr key={`${row.category}|${row.type}`}>
                      <td className="px-5 py-2.5 text-slate-800">{CATEGORY_LABELS[row.category] ?? row.category}</td>
                      <td className="px-5 py-2.5 text-slate-600">{TYPE_LABELS[row.type] ?? row.type}</td>
                      <td className="px-5 py-2.5 text-right text-slate-800">{formatNumber(row.volume)}</td>
                      <td className="px-5 py-2.5 text-right text-slate-800">
                        {data.costHidden ? "—" : row.cost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
