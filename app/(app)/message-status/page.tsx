"use client";

import { useEffect, useMemo, useState } from "react";
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
import InlineAlert from "@/components/ui/InlineAlert";
import { formatDateTime } from "@/lib/utils";
import type { MessageRecord } from "@/types";

const PAGE_SIZE = 10;

export default function MessageStatusPage() {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<MessageRecord | null>(null);

  useEffect(() => {
    fetch("/api/message-status")
      .then((res) => res.json())
      .then((data) => setMessages(data.messages ?? []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((row) => {
      const matchesQuery =
        !q ||
        (row.recipientName ?? "").toLowerCase().includes(q) ||
        row.recipientPhone.includes(q) ||
        (row.campaignName ?? "").toLowerCase().includes(q);
      const matchesStatus = status === "all" || row.status === status;
      const day = (row.sentAt ?? row.createdAt).slice(0, 10);
      const matchesFrom = !range.from || day >= range.from;
      const matchesTo = !range.to || day <= range.to;
      return matchesQuery && matchesStatus && matchesFrom && matchesTo;
    });
  }, [messages, query, status, range]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<MessageRecord>[] = [
    {
      key: "recipient",
      header: "Recipient",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.recipientName || "—"}</p>
          <p className="text-xs text-slate-400">{row.recipientPhone}</p>
        </div>
      ),
    },
    { key: "campaign", header: "Campaign", render: (row) => row.campaignName || "—" },
    {
      key: "preview",
      header: "Message",
      render: (row) => (
        <span className="line-clamp-1 block max-w-[220px] text-xs text-slate-500">{row.preview}</span>
      ),
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "sent",
      header: "Sent at",
      render: (row) => <span className="text-xs">{row.sentAt ? formatDateTime(row.sentAt) : "—"}</span>,
    },
    {
      key: "error",
      header: "Error",
      render: (row) =>
        row.errorMessage ? (
          <span className="line-clamp-1 block max-w-[180px] text-xs text-red-600">{row.errorMessage}</span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Message Status"
        description="Real delivery outcome for every message this CMS has sent."
      />

      <InlineAlert tone="warning" className="mb-5">
        Every row here is a real send (via Campaigns, Bulk Sender, or the Inbox) — statuses start
        at &quot;Sent&quot; or &quot;Failed&quot;. &quot;Delivered&quot;/&quot;Read&quot; only
        appear if Meta&apos;s delivery-status webhook is configured and reachable (a public URL —
        see README-BACKEND.md); without it, that&apos;s expected, not a bug.
      </InlineAlert>

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
          loading={loading}
          emptyTitle="No messages match these filters"
          emptyDescription="Send a campaign or bulk message to see records appear here."
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Message detail"
        description={detail?.campaignName ?? undefined}
        footer={<Button onClick={() => setDetail(null)}>Close</Button>}
      >
        {detail && (
          <div className="space-y-5 text-sm">
            <dl className="space-y-2.5">
              <Row label="Recipient" value={detail.recipientName || "—"} />
              <Row label="Phone" value={detail.recipientPhone} />
              <Row label="Template" value={detail.templateName || "—"} />
              <Row label="Sent at" value={detail.sentAt ? formatDateTime(detail.sentAt) : "—"} />
              {detail.whatsappMessageId && (
                <Row label="WhatsApp message ID" value={detail.whatsappMessageId} mono />
              )}
            </dl>

            <div className="rounded-xl bg-slate-100 p-4">
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-emerald-100 px-3.5 py-2.5 text-sm text-slate-800">
                {detail.preview}
              </div>
            </div>

            {detail.errorMessage && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {detail.errorMessage}
              </p>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500">Status timeline</p>
              <ol className="space-y-3 border-l border-slate-200 pl-4">
                {detail.sentAt && (
                  <TimelineItem label="Sent" time={detail.sentAt} />
                )}
                {detail.deliveredAt && (
                  <TimelineItem label="Delivered" time={detail.deliveredAt} />
                )}
                {detail.readAt && (
                  <TimelineItem label="Read" time={detail.readAt} />
                )}
                {detail.status === "failed" && !detail.sentAt && (
                  <TimelineItem label="Failed" time={detail.createdAt} />
                )}
              </ol>
              {!detail.deliveredAt && detail.status === "sent" && (
                <p className="mt-2 text-xs text-slate-400">
                  No delivery/read update received yet — this needs Meta&apos;s webhook configured
                  (see README-BACKEND.md).
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={mono ? "font-mono text-xs text-slate-800" : "text-slate-800"}>{value}</dd>
    </div>
  );
}

function TimelineItem({ label, time }: { label: string; time: string }) {
  return (
    <li className="relative">
      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-indigo-500" />
      <p className="text-sm text-slate-800">{label}</p>
      <p className="text-xs text-slate-400">{formatDateTime(time)}</p>
    </li>
  );
}
