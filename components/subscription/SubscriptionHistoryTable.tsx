"use client";

import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import DataTable, { type Column } from "@/components/ui/DataTable";
import SearchInput from "@/components/ui/SearchInput";
import StatusBadge from "@/components/ui/StatusBadge";
import Tabs from "@/components/ui/Tabs";
import SubscriptionBadge from "./SubscriptionBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { SubscriptionHistoryEntry, SubscriptionStatus } from "@/types";

const tabs: { label: string; value: "all" | SubscriptionStatus }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Free Trial", value: "trial" },
  { label: "Expiring Soon", value: "expiring" },
  { label: "Expired", value: "expired" },
  { label: "Suspended", value: "suspended" },
];

export default function SubscriptionHistoryTable({
  entries,
  showClientColumn = false,
  showSearch = false,
  title = "Subscription history",
}: {
  entries: SubscriptionHistoryEntry[];
  showClientColumn?: boolean;
  showSearch?: boolean;
  title?: string;
}) {
  const [tab, setTab] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesTab = tab === "all" || entry.accessStatus === tab;
      const matchesQuery =
        !q ||
        entry.clientName.toLowerCase().includes(q) ||
        entry.planName.toLowerCase().includes(q);
      return matchesTab && matchesQuery;
    });
  }, [entries, tab, query]);

  const columns: Column<SubscriptionHistoryEntry>[] = [
    ...(showClientColumn
      ? [
          {
            key: "client",
            header: "Client",
            render: (row: SubscriptionHistoryEntry) => (
              <span className="font-medium text-slate-900">{row.clientName}</span>
            ),
          } as Column<SubscriptionHistoryEntry>,
        ]
      : []),
    {
      key: "plan",
      header: "Plan",
      render: (row) => (
        <div>
          <p className="text-sm text-slate-800">{row.planName}</p>
          <p className="text-xs text-slate-400">
            {row.amount > 0 ? `${formatCurrency(row.amount)} / year` : "No charge"}
          </p>
        </div>
      ),
    },
    { key: "start", header: "Start date", render: (row) => formatDate(row.startDate) },
    { key: "expiry", header: "Expiry date", render: (row) => formatDate(row.expiryDate) },
    {
      key: "payment",
      header: "Payment status",
      render: (row) =>
        row.paymentStatus === "not_required" ? (
          <span className="text-xs text-slate-400">Not required (trial)</span>
        ) : (
          <StatusBadge status={row.paymentStatus} />
        ),
    },
    {
      key: "access",
      header: "Access status",
      render: (row) => <SubscriptionBadge status={row.accessStatus} />,
    },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {showSearch && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search clients or plans"
            className="w-full sm:w-64"
          />
        )}
      </div>
      <div className="px-5 pt-3">
        <Tabs
          tabs={tabs.map((item) => ({
            label: item.label,
            value: item.value,
            count:
              item.value === "all"
                ? entries.length
                : entries.filter((entry) => entry.accessStatus === item.value).length,
          }))}
          active={tab}
          onChange={setTab}
        />
      </div>
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.id}
        emptyTitle="No subscriptions in this view"
        emptyDescription="Switch tabs or clear the search to see other subscription states."
      />
    </Card>
  );
}
