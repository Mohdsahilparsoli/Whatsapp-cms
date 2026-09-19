"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, Download, Eye, Send, Users, XCircle } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";
import ChartCard from "@/components/ui/ChartCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import FilterDropdown from "@/components/ui/FilterDropdown";
import DateRangeFilter, { type DateRange } from "@/components/ui/DateRangeFilter";
import StatusBadge from "@/components/ui/StatusBadge";
import InlineAlert from "@/components/ui/InlineAlert";
import LoadingState from "@/components/ui/LoadingState";
import { useAuth } from "@/lib/auth";
import { downloadCsv, formatNumber, percent } from "@/lib/utils";
import type { CampaignPerfRow } from "@/lib/reportsAggregate";

interface Totals {
  recipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}
interface DailyPoint {
  label: string;
  dateKey: string;
  sent: number;
  delivered: number;
  read: number;
}
interface ClientReportData {
  totals: Totals;
  dailyStats: DailyPoint[];
  campaignPerformance: CampaignPerfRow[];
  campaigns: { id: string; name: string }[];
}
interface AdminReportData {
  totals: Totals;
  dailyStats: DailyPoint[];
  topClients: { clientId: string; name: string; count: number }[];
}

const emptyTotals: Totals = { recipients: 0, sent: 0, delivered: 0, read: 0, failed: 0 };

export default function ReportsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [campaignFilter, setCampaignFilter] = useState("all");
  const [range, setRange] = useState<DateRange>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 90);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { from: iso(from), to: iso(to) };
  });
  const [loading, setLoading] = useState(true);
  const [clientData, setClientData] = useState<ClientReportData | null>(null);
  const [adminData, setAdminData] = useState<AdminReportData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);

      if (isSuperAdmin) {
        const res = await fetch(`/api/reports/admin?${params}`);
        const data = await res.json();
        setAdminData(data);
      } else {
        if (campaignFilter !== "all") params.set("campaignId", campaignFilter);
        const res = await fetch(`/api/reports?${params}`);
        const data = await res.json();
        setClientData(data);
      }
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, range, campaignFilter]);

  useEffect(() => {
    // False positive — see the identical note on this pattern in
    // app/(app)/clients/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const totals = (isSuperAdmin ? adminData?.totals : clientData?.totals) ?? emptyTotals;
  const dailyStats = (isSuperAdmin ? adminData?.dailyStats : clientData?.dailyStats) ?? [];

  function exportCsv() {
    if (isSuperAdmin && adminData) {
      downloadCsv("top-clients-report.csv", [
        ["Client", "Messages"],
        ...adminData.topClients.map((c) => [c.name, c.count]),
      ]);
      return;
    }
    if (clientData) {
      downloadCsv("campaign-report.csv", [
        ["Campaign", "Sent", "Delivered", "Read", "Failed", "Delivery %", "Read %"],
        ...clientData.campaignPerformance.map((row) => [
          row.name,
          row.sent,
          row.delivered,
          row.read,
          row.failed,
          percent(row.delivered, row.sent),
          percent(row.read, row.delivered),
        ]),
      ]);
    }
  }

  const columns: Column<CampaignPerfRow>[] = [
    {
      key: "name",
      header: "Campaign",
      render: (row) => <p className="font-medium text-slate-900">{row.name}</p>,
    },
    { key: "sent", header: "Sent", render: (row) => formatNumber(row.sent) },
    { key: "delivered", header: "Delivered", render: (row) => formatNumber(row.delivered) },
    { key: "read", header: "Read", render: (row) => formatNumber(row.read) },
    { key: "failed", header: "Failed", render: (row) => formatNumber(row.failed) },
    {
      key: "deliveryRate",
      header: "Delivery rate",
      render: (row) => `${percent(row.delivered, row.sent)}%`,
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        description={
          isSuperAdmin
            ? "Real messaging volume across every client account."
            : "How your campaigns actually performed over the selected period."
        }
        actions={
          <Button onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <InlineAlert tone="warning" className="mb-5">
        Every figure here comes from real message records — &quot;Delivered&quot;/&quot;Read&quot;
        only count messages Meta&apos;s webhook has actually confirmed (see Message Status for
        setup). Until that&apos;s configured, Sent and Failed are accurate but Delivered/Read will
        read low or zero.
      </InlineAlert>

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <DateRangeFilter value={range} onChange={setRange} />
          {!isSuperAdmin && (
            <FilterDropdown
              label="Campaign"
              value={campaignFilter}
              onChange={setCampaignFilter}
              options={[
                { label: "All campaigns", value: "all" },
                ...(clientData?.campaigns ?? []).map((c) => ({ label: c.name, value: c.id })),
              ]}
            />
          )}
          <span className="ml-auto text-xs text-slate-400">
            {range.from || "—"} to {range.to || "—"}
          </span>
        </div>
      </Card>

      {loading ? (
        <LoadingState rows={3} label="Loading report" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Recipients" value={formatNumber(totals.recipients)} icon={Users} />
            <StatCard label="Sent" value={formatNumber(totals.sent)} icon={Send} />
            <StatCard
              label="Delivered"
              value={formatNumber(totals.delivered)}
              hint={`${percent(totals.delivered, totals.sent)}% of sent`}
              icon={CheckCheck}
              tone="positive"
            />
            <StatCard
              label="Read"
              value={formatNumber(totals.read)}
              hint={`${percent(totals.read, totals.delivered)}% of delivered`}
              icon={Eye}
            />
            <StatCard label="Failed" value={formatNumber(totals.failed)} icon={XCircle} tone="negative" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <ChartCard
                title="Messages by day"
                description="Real totals for the last 7 days"
                data={dailyStats.map((day) => ({
                  label: day.label,
                  values: [
                    { key: "Sent", value: day.sent, color: "#6366f1" },
                    { key: "Delivered", value: day.delivered, color: "#10b981" },
                    { key: "Read", value: day.read, color: "#0ea5e9" },
                  ],
                }))}
                legend={[
                  { key: "sent", label: "Sent", color: "#6366f1" },
                  { key: "delivered", label: "Delivered", color: "#10b981" },
                  { key: "read", label: "Read", color: "#0ea5e9" },
                ]}
              />
            </div>

            <Card>
              <CardHeader title={isSuperAdmin ? "Top clients by volume" : "Delivery breakdown"} />
              <ul className="divide-y divide-slate-100">
                {isSuperAdmin
                  ? (adminData?.topClients ?? []).length === 0
                    ? <li className="px-5 py-4 text-sm text-slate-400">No messages sent yet.</li>
                    : (adminData?.topClients ?? []).map((client) => (
                        <li key={client.clientId} className="flex items-center justify-between px-5 py-3">
                          <span className="text-sm text-slate-700">{client.name}</span>
                          <span className="text-sm font-medium text-slate-900">
                            {formatNumber(client.count)}
                          </span>
                        </li>
                      ))
                  : [
                      { label: "Delivered", value: totals.delivered, color: "bg-emerald-500" },
                      { label: "Read", value: totals.read, color: "bg-sky-500" },
                      { label: "Failed", value: totals.failed, color: "bg-red-500" },
                    ].map((item) => (
                      <li key={item.label} className="px-5 py-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">{item.label}</span>
                          <span className="font-medium text-slate-900">
                            {formatNumber(item.value)} · {percent(item.value, totals.sent)}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100">
                          <div
                            className={`h-1.5 rounded-full ${item.color}`}
                            style={{ width: `${percent(item.value, totals.sent)}%` }}
                          />
                        </div>
                      </li>
                    ))}
              </ul>
            </Card>
          </div>

          {!isSuperAdmin && (
            <Card className="mt-6">
              <CardHeader title="Campaign performance" description="Real totals per campaign" />
              <DataTable
                columns={columns}
                rows={clientData?.campaignPerformance ?? []}
                rowKey={(row) => row.key}
                emptyTitle="No campaign data for this filter"
                emptyDescription="Send a campaign or bulk message to see performance here."
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
