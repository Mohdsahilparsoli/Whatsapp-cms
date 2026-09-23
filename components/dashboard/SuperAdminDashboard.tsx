"use client";

import { useEffect, useState } from "react";
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
import Button from "@/components/ui/Button";
import LoadingState from "@/components/ui/LoadingState";
import { formatDate, formatNumber, percent } from "@/lib/utils";

interface ClientUsageRow {
  id: string;
  name: string;
  userId: string;
  contacts: number;
  messagesSent: number;
  expiryDate: string;
  status: string;
}

interface AdminCampaignRow {
  id: string;
  name: string;
  clientName: string;
  audienceSize: number;
  sentCount: number;
  status: string;
}

interface ActivityItem {
  id: string;
  text: string;
  time: string;
}

interface AdminDashboardData {
  totalClients: number;
  activeClients: number;
  suspendedClients: number;
  expiringClients: number;
  totalMessagesSent: number;
  clientUsage: ClientUsageRow[];
  recentCampaigns: AdminCampaignRow[];
  recentActivity: ActivityItem[];
}

export default function SuperAdminDashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/admin")
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const usageColumns: Column<ClientUsageRow>[] = [
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

  const campaignColumns: Column<AdminCampaignRow>[] = [
    {
      key: "name",
      header: "Campaign",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-400">{row.clientName}</p>
        </div>
      ),
    },
    { key: "audience", header: "Audience", render: (row) => formatNumber(row.audienceSize) },
    {
      key: "sent",
      header: "Sent",
      render: (row) => `${formatNumber(row.sentCount)} (${percent(row.sentCount, row.audienceSize)}%)`,
    },
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

      {loading ? (
        <LoadingState rows={3} label="Loading dashboard" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Total clients" value={data?.totalClients ?? 0} icon={Building2} />
            <StatCard
              label="Active clients"
              value={data?.activeClients ?? 0}
              icon={CheckCircle2}
              tone="positive"
            />
            <StatCard
              label="Expiring subscriptions"
              value={data?.expiringClients ?? 0}
              hint="Within the next 45 days"
              icon={AlertTriangle}
              tone="warning"
            />
            <StatCard
              label="Suspended clients"
              value={data?.suspendedClients ?? 0}
              icon={PauseCircle}
              tone="negative"
            />
            <StatCard
              label="Total messages sent"
              value={formatNumber(data?.totalMessagesSent ?? 0)}
              icon={MessageSquare}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Client usage overview"
                description="Real contacts and message volume per account"
                action={
                  <Link href="/clients" className="text-xs font-medium text-indigo-600 hover:underline">
                    View all
                  </Link>
                }
              />
              <DataTable
                columns={usageColumns}
                rows={data?.clientUsage ?? []}
                rowKey={(r) => r.id}
                emptyTitle="No clients yet"
                emptyDescription="Create a client to see them here."
              />
            </Card>

            <Card>
              <CardHeader title="Recent activity" description="Last 7 days, across all clients" />
              <ul className="divide-y divide-slate-100">
                {(data?.recentActivity ?? []).length === 0 && (
                  <li className="px-5 py-6 text-sm text-slate-400">Nothing recent to show.</li>
                )}
                {data?.recentActivity.map((item) => (
                  <li key={item.id} className="px-5 py-3">
                    <p className="text-sm text-slate-700">{item.text}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{item.time}</p>
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
            <DataTable
              columns={campaignColumns}
              rows={data?.recentCampaigns ?? []}
              rowKey={(r) => r.id}
              emptyTitle="No campaigns yet"
              emptyDescription="Campaigns from any client will show up here."
            />
          </Card>
        </>
      )}
    </div>
  );
}
