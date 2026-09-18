"use client";

import { useMemo, useState } from "react";
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
import DemoNotice from "@/components/ui/DemoNotice";
import { campaigns, dailyStats } from "@/data/campaigns";
import { clients } from "@/data/clients";
import { useAuth } from "@/lib/auth";
import { downloadCsv, formatNumber, percent } from "@/lib/utils";
import type { MockCampaign } from "@/types";

export default function ReportsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [campaignFilter, setCampaignFilter] = useState("all");
  const [range, setRange] = useState<DateRange>({ from: "2026-08-01", to: "2026-09-15" });

  const rows = useMemo(
    () =>
      campaignFilter === "all"
        ? campaigns
        : campaigns.filter((c) => c.id === campaignFilter),
    [campaignFilter]
  );

  const totals = rows.reduce(
    (acc, row) => ({
      sent: acc.sent + row.sent,
      delivered: acc.delivered + row.delivered,
      read: acc.read + row.read,
      failed: acc.failed + row.failed,
      recipients: acc.recipients + row.audienceSize,
    }),
    { sent: 0, delivered: 0, read: 0, failed: 0, recipients: 0 }
  );

  function exportCsv() {
    downloadCsv("campaign-report-demo.csv", [
      ["Campaign", "Audience", "Recipients", "Sent", "Delivered", "Read", "Failed", "Delivery %", "Read %"],
      ...rows.map((row) => [
        row.name,
        row.audience,
        row.audienceSize,
        row.sent,
        row.delivered,
        row.read,
        row.failed,
        percent(row.delivered, row.sent),
        percent(row.read, row.delivered),
      ]),
    ]);
  }

  const columns: Column<MockCampaign>[] = [
    {
      key: "name",
      header: "Campaign",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-400">{row.audience}</p>
        </div>
      ),
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
            ? "Messaging performance across all client accounts."
            : "How your campaigns performed over the selected period."
        }
        actions={
          <Button onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <DemoNotice>
        Every figure on this page is demo data generated in the browser. The CSV export contains the
        same mock values.
      </DemoNotice>

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <DateRangeFilter value={range} onChange={setRange} />
          <FilterDropdown
            label="Campaign"
            value={campaignFilter}
            onChange={setCampaignFilter}
            options={[
              { label: "All campaigns", value: "all" },
              ...campaigns.map((c) => ({ label: c.name, value: c.id })),
            ]}
          />
          <span className="ml-auto text-xs text-slate-400">
            {range.from || "—"} to {range.to || "—"}
          </span>
        </div>
      </Card>

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
            description="Demo values for the last 7 days"
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
              ? [...clients]
                  .sort((a, b) => b.messagesSent - a.messagesSent)
                  .slice(0, 5)
                  .map((client) => (
                    <li key={client.id} className="flex items-center justify-between px-5 py-3">
                      <span className="text-sm text-slate-700">{client.name}</span>
                      <span className="text-sm font-medium text-slate-900">
                        {formatNumber(client.messagesSent)}
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

      <Card className="mt-6">
        <CardHeader title="Campaign performance" description="Demo values" />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyTitle="No campaign data for this filter"
        />
      </Card>
    </div>
  );
}
