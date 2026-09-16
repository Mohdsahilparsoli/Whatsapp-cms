"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import SearchInput from "@/components/ui/SearchInput";
import FilterDropdown from "@/components/ui/FilterDropdown";
import DateRangeFilter, { type DateRange } from "@/components/ui/DateRangeFilter";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import Pagination from "@/components/ui/Pagination";
import DemoNotice from "@/components/ui/DemoNotice";
import { messageRecords } from "@/data/campaigns";
import type { MessageRecord } from "@/types";

const PAGE_SIZE = 10;

export default function MessageStatusPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<MessageRecord | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messageRecords.filter((row) => {
      const matchesQuery =
        !q ||
        row.recipientName.toLowerCase().includes(q) ||
        row.recipientPhone.includes(q) ||
        row.campaignName.toLowerCase().includes(q);
      const matchesStatus = status === "all" || row.status === status;
      const day = row.sentAt.slice(0, 10);
      const matchesFrom = !range.from || day >= range.from;
      const matchesTo = !range.to || day <= range.to;
      return matchesQuery && matchesStatus && matchesFrom && matchesTo;
    });
  }, [query, status, range]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<MessageRecord>[] = [
    {
      key: "recipient",
      header: "Recipient",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.recipientName}</p>
          <p className="text-xs text-slate-400">{row.recipientPhone}</p>
        </div>
      ),
    },
    { key: "campaign", header: "Campaign", render: (row) => row.campaignName },
    {
      key: "preview",
      header: "Message",
      render: (row) => (
        <span className="line-clamp-1 block max-w-[220px] text-xs text-slate-500">{row.preview}</span>
      ),
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "sent", header: "Sent at", render: (row) => <span className="text-xs">{row.sentAt}</span> },
    {
      key: "error",
      header: "Error",
      render: (row) =>
        row.error ? (
          <span className="line-clamp-1 block max-w-[180px] text-xs text-red-600">{row.error}</span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Message Status"
        description="Delivery outcome for every message the CMS has queued."
      />

      <DemoNotice>
        Statuses are mock data. Live delivery receipts require WhatsApp Cloud API webhooks.
      </DemoNotice>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Search recipient or campaign"
            className="w-full sm:w-64"
          />
          <FilterDropdown
            label="Status"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { label: "All statuses", value: "all" },
              { label: "Queued", value: "queued" },
              { label: "Sent", value: "sent" },
              { label: "Delivered", value: "delivered" },
              { label: "Read", value: "read" },
              { label: "Failed", value: "failed" },
            ]}
          />
          <DateRangeFilter
            value={range}
            onChange={(v) => {
              setRange(v);
              setPage(1);
            }}
          />
          <span className="ml-auto text-xs text-slate-400">{filtered.length} messages</span>
        </div>

        <DataTable
          columns={columns}
          rows={paged}
          rowKey={(row) => row.id}
          onRowClick={setDetail}
          emptyTitle="No messages match these filters"
          emptyDescription="Try widening the date range or clearing the status filter."
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Message detail"
        description={detail?.campaignName}
        footer={<Button onClick={() => setDetail(null)}>Close</Button>}
      >
        {detail && (
          <div className="space-y-5 text-sm">
            <dl className="space-y-2.5">
              <Row label="Recipient" value={detail.recipientName} />
              <Row label="Phone" value={detail.recipientPhone} />
              <Row label="Sent at" value={detail.sentAt} />
            </dl>

            <div className="rounded-xl bg-slate-100 p-4">
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-emerald-100 px-3.5 py-2.5 text-sm text-slate-800">
                {detail.preview}
              </div>
            </div>

            {detail.error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {detail.error}
              </p>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500">Status timeline</p>
              <ol className="space-y-3 border-l border-slate-200 pl-4">
                {detail.timeline.map((event) => (
                  <li key={event.label} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-indigo-500" />
                    <p className="text-sm text-slate-800">{event.label}</p>
                    <p className="text-xs text-slate-400">{event.time}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}
