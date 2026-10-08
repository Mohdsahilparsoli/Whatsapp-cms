"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/utils";

interface PaymentRow {
  id: string;
  referenceId: string;
  customerPhone: string;
  customerName: string | null;
  amountPaise: number;
  status: string;
  orderStatus: string | null;
  paidAt: string | null;
  createdAt: string;
}

const ORDER_OPTIONS = [
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Cancelled" },
];

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/payments");
      const data = await res.json();
      setRows(data.payments ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setRows(data.payments ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateOrder(id: string, status: string) {
    if (!status) return;
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/payments/${id}/order-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Could not update the order.");
      else await load();
    } finally {
      setBusyId(null);
    }
  }

  const received = rows.filter((r) => r.status === "captured").reduce((sum, r) => sum + r.amountPaise, 0);

  const columns: Column<PaymentRow>[] = [
    {
      key: "customer",
      header: "Customer",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.customerName || "—"}</p>
          <p className="text-xs text-slate-400">{row.customerPhone}</p>
        </div>
      ),
    },
    {
      key: "order",
      header: "Order",
      render: (row) => <span className="font-mono text-xs text-slate-600">{row.referenceId}</span>,
    },
    { key: "amount", header: "Amount", render: (row) => <span className="font-medium">{rupees(row.amountPaise)}</span> },
    {
      key: "status",
      header: "Payment",
      render: (row) => (
        <StatusBadge
          status={row.status === "captured" ? "paid" : row.status}
          label={row.status === "captured" ? "Paid" : row.status === "failed" ? "Failed" : "Awaiting payment"}
        />
      ),
    },
    {
      key: "orderStatus",
      header: "Order status",
      render: (row) => (
        <select
          aria-label="Update order status"
          value={row.orderStatus ?? ""}
          disabled={busyId === row.id}
          onChange={(e) => updateOrder(row.id, e.target.value)}
          className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs"
        >
          <option value="">{row.orderStatus ? "—" : "Not announced"}</option>
          {ORDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "when",
      header: "Sent",
      render: (row) => <span className="text-xs">{formatDateTime(row.paidAt ?? row.createdAt)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Payment requests sent on WhatsApp (UPI) and whether customers have paid. Send one from the Inbox."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-6 border-b border-slate-200 px-5 py-3 text-sm">
          <span className="text-slate-500">
            Requests <strong className="text-slate-900">{rows.length}</strong>
          </span>
          <span className="text-slate-500">
            Paid <strong className="text-slate-900">{rows.filter((r) => r.status === "captured").length}</strong>
          </span>
          <span className="text-slate-500">
            Received <strong className="text-emerald-700">{rupees(received)}</strong>
          </span>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No payment requests yet"
          emptyDescription="Open a chat in the Inbox and use the payment button to send a bill."
        />
      </Card>
    </div>
  );
}
