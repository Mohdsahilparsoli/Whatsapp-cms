"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  MessageSquare,
  PauseCircle,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import Card, { CardHeader } from "@/components/ui/Card";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import DemoNotice from "@/components/ui/DemoNotice";
import Button from "@/components/ui/Button";
import { clientActivity, clients } from "@/data/clients";
import { campaigns } from "@/data/campaigns";
import { formatDate, formatNumber, daysUntil } from "@/lib/utils";
import type { Client, MockCampaign } from "@/types";

export default function SuperAdminDashboard() {
  const active = clients.filter((c) => c.status === "active").length;
  const suspended = clients.filter((c) => c.status === "suspended").length;
  const expiring = clients.filter((c) => {
    const days = daysUntil(c.expiryDate);
    return days >= 0 && days <= 45;
  }).length;
  const totalMessages = clients.reduce((sum, c) => sum + c.messagesSent, 0);

  const usageColumns: Column<Client>[] = [
    {
      key: "name",
      header: "Client",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-400">{row.userId}</p>
        </div>
      ),
    },
    { key: "contacts", header: "Contacts", render: (row) => formatNumber(row.contacts) },
    { key: "messages", header: "Messages sent", render: (row) => formatNumber(row.messagesSent) },
    { key: "expiry", header: "Expires", render: (row) => formatDate(row.expiryDate) },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
  ];

  const campaignColumns: Column<MockCampaign>[] = [
    { key: "name", header: "Campaign", render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
    { key: "audience", header: "Audience", render: (row) => formatNumber(row.audienceSize) },
    { key: "sent", header: "Sent", render: (row) => formatNumber(row.sent) },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Super Admin dashboard"
        description="Platform-wide view of client accounts, subscriptions, and messaging volume."
        actions={
          <Link href="/clients">
            <Button variant="primary">Manage clients</Button>
          </Link>
        }
      />

      <DemoNotice>
        All figures on this page are mock data for the frontend demo. No backend, database, or Meta
        API is connected.
      </DemoNotice>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total clients" value={clients.length} icon={Building2} />
        <StatCard label="Active clients" value={active} icon={CheckCircle2} tone="positive" />
        <StatCard
          label="Expiring subscriptions"
          value={expiring}
          hint="Within the next 45 days"
          icon={AlertTriangle}
          tone="warning"
        />
        <StatCard label="Suspended clients" value={suspended} icon={PauseCircle} tone="negative" />
        <StatCard
          label="Total messages sent"
          value={formatNumber(totalMessages)}
          icon={MessageSquare}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Client usage overview"
            description="Contacts and message volume per account"
            action={
              <Link href="/clients" className="text-xs font-medium text-indigo-600 hover:underline">
                View all
              </Link>
            }
          />
          <DataTable columns={usageColumns} rows={clients} rowKey={(r) => r.id} />
        </Card>

        <Card>
          <CardHeader title="Recent client activity" />
          <ul className="divide-y divide-slate-100">
            {clientActivity.map((item) => (
              <li key={item.id} className="px-5 py-3">
                <p className="text-sm text-slate-700">{item.action}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {item.client} · {item.time}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Recent campaigns across clients"
          action={
            <Link href="/reports" className="text-xs font-medium text-indigo-600 hover:underline">
              Open reports
            </Link>
          }
        />
        <DataTable columns={campaignColumns} rows={campaigns.slice(0, 5)} rowKey={(r) => r.id} />
      </Card>
    </div>
  );
}
