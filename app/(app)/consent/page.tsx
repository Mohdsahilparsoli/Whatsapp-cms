"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import SearchInput from "@/components/ui/SearchInput";
import Tabs from "@/components/ui/Tabs";
import StatusBadge from "@/components/ui/StatusBadge";
import Pagination from "@/components/ui/Pagination";
import DemoNotice from "@/components/ui/DemoNotice";
import StatCard from "@/components/ui/StatCard";
import { contacts as seed } from "@/data/contacts";
import { formatDate } from "@/lib/utils";
import type { Contact, ConsentStatus } from "@/types";

const PAGE_SIZE = 8;

export default function ConsentPage() {
  const [rows, setRows] = useState<Contact[]>(seed);
  const [tab, setTab] = useState<"all" | ConsentStatus>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      opted_in: rows.filter((r) => r.consent === "opted_in").length,
      opted_out: rows.filter((r) => r.consent === "opted_out").length,
      pending: rows.filter((r) => r.consent === "pending").length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesTab = tab === "all" || row.consent === tab;
      const matchesQuery = !q || (row.name ?? "").toLowerCase().includes(q) || row.phone.includes(q);
      return matchesTab && matchesQuery;
    });
  }, [rows, tab, query]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function setConsent(contact: Contact, consent: ConsentStatus) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === contact.id ? { ...row, consent, consentDate: "2026-09-15" } : row
      )
    );
    setToast(
      consent === "opted_out"
        ? `${contact.name || contact.phone} opted out and will be excluded from campaigns.`
        : `${contact.name || contact.phone} marked as ${consent.replace("_", " ")}.`
    );
  }

  const columns: Column<Contact>[] = [
    {
      key: "name",
      header: "Contact",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name || "—"}</p>
          <p className="text-xs text-slate-400">{row.phone}</p>
        </div>
      ),
    },
    { key: "consent", header: "Consent", render: (row) => <StatusBadge status={row.consent} /> },
    { key: "source", header: "Source", render: (row) => row.consentSource },
    { key: "date", header: "Recorded", render: (row) => formatDate(row.consentDate) },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          {row.consent !== "opted_in" && (
            <Button size="sm" variant="primary" onClick={() => setConsent(row, "opted_in")}>
              Mark opted in
            </Button>
          )}
          {row.consent !== "opted_out" && (
            <Button size="sm" variant="danger" onClick={() => setConsent(row, "opted_out")}>
              Opt out
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Consent & Opt-out"
        description="Who agreed to receive messages, where that consent came from, and who has opted out."
      />

      <DemoNotice>
        Opted-out contacts are automatically removed from campaign and bulk-send recipient counts
        throughout this demo.
      </DemoNotice>

      {toast && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Opted in" value={counts.opted_in} tone="positive" />
        <StatCard label="Pending" value={counts.pending} tone="warning" />
        <StatCard label="Opted out" value={counts.opted_out} tone="negative" />
      </div>

      <Card>
        <div className="px-5 pt-3">
          <Tabs
            tabs={[
              { label: "All", value: "all", count: rows.length },
              { label: "Opted in", value: "opted_in", count: counts.opted_in },
              { label: "Pending", value: "pending", count: counts.pending },
              { label: "Opted out", value: "opted_out", count: counts.opted_out },
            ]}
            active={tab}
            onChange={(v) => {
              setTab(v as typeof tab);
              setPage(1);
            }}
          />
        </div>
        <div className="border-b border-slate-200 px-5 py-3">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Search contacts"
            className="w-full sm:w-72"
          />
        </div>
        <DataTable
          columns={columns}
          rows={paged}
          rowKey={(row) => row.id}
          emptyTitle="No contacts in this view"
          emptyDescription="Switch tabs or clear the search to see more."
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>
    </div>
  );
}
