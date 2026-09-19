"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCheck,
  Eye,
  MessageSquare,
  Send,
  Users,
  XCircle,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import Card, { CardHeader } from "@/components/ui/Card";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import InlineAlert from "@/components/ui/InlineAlert";
import LoadingState from "@/components/ui/LoadingState";
import Button from "@/components/ui/Button";
import { getPlan } from "@/data/plans";
import SubscriptionBadge from "@/components/subscription/SubscriptionBadge";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { describeDays, formatCurrency, formatDate, formatDateTime, formatNumber, percent } from "@/lib/utils";
import type { Campaign, MessageRecord } from "@/types";

interface DashboardData {
  totalContacts: number;
  activeCampaigns: number;
  totals: { recipients: number; sent: number; delivered: number; read: number; failed: number };
  recentCampaigns: Campaign[];
  recentMessages: MessageRecord[];
}

export default function ClientAdminDashboard() {
  const { user } = useAuth();
  const { current: subscription, status, daysRemaining } = useSubscription();
  const plan = getPlan(subscription?.planId);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/client")
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const columns: Column<Campaign>[] = [
    {
      key: "name",
      header: "Campaign",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-400">{row.templateName}</p>
        </div>
      ),
    },
    { key: "audience", header: "Recipients", render: (row) => formatNumber(row.audienceSize) },
    {
      key: "progress",
      header: "Progress",
      render: (row) => (
        <div className="w-28">
          <div className="h-1.5 w-full rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-indigo-500"
              style={{ width: `${percent(row.sentCount, row.audienceSize)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {percent(row.sentCount, row.audienceSize)}%
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name ?? ""}`}
        description="Your real WhatsApp messaging activity at a glance."
        actions={
          <>
            <Link href="/bulk-sender">
              <Button>Send bulk message</Button>
            </Link>
            <Link href="/campaigns">
              <Button variant="primary">New campaign</Button>
            </Link>
          </>
        }
      />

      <InlineAlert tone="warning" className="mb-5">
        Sent/Delivered/Read/Failed below are real, from actual WhatsApp sends via Meta&apos;s
        shared test number — Delivered/Read only count what Meta&apos;s delivery webhook has
        confirmed (see Message Status).
      </InlineAlert>

      {loading ? (
        <LoadingState rows={3} label="Loading dashboard" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Total contacts" value={formatNumber(data?.totalContacts ?? 0)} icon={Users} />
            <StatCard label="Active campaigns" value={data?.activeCampaigns ?? 0} icon={MessageSquare} />
            <StatCard label="Messages sent" value={formatNumber(data?.totals.sent ?? 0)} icon={Send} />
            <StatCard
              label="Delivered"
              value={formatNumber(data?.totals.delivered ?? 0)}
              icon={CheckCheck}
              tone="positive"
            />
            <StatCard label="Read" value={formatNumber(data?.totals.read ?? 0)} icon={Eye} />
            <StatCard
              label="Failed"
              value={formatNumber(data?.totals.failed ?? 0)}
              icon={XCircle}
              tone="negative"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Recent campaigns"
                action={
                  <Link href="/campaigns" className="text-xs font-medium text-indigo-600 hover:underline">
                    View all
                  </Link>
                }
              />
              <DataTable
                columns={columns}
                rows={data?.recentCampaigns ?? []}
                rowKey={(r) => r.id}
                emptyTitle="No campaigns yet"
                emptyDescription="Create a campaign to see it here."
              />
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader title="WhatsApp connection" />
                <div className="space-y-2.5 px-5 py-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Status</span>
                    <StatusBadge status="pending" label="Shared test number" />
                  </div>
                  <p className="text-xs text-slate-400">
                    All clients currently share one Meta test number for sending — a real,
                    per-client WhatsApp Business Account connection is a later phase.
                  </p>
                  <Link
                    href="/whatsapp-setup"
                    className="block pt-1 text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Open account setup
                  </Link>
                </div>
              </Card>

              <Card>
                <CardHeader title="Subscription" />
                <div className="space-y-2.5 px-5 py-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Plan</span>
                    <span className="text-slate-800">
                      {plan
                        ? `${plan.name} — ${formatCurrency(plan.price)} / year`
                        : "Free Trial (14 days)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Status</span>
                    {status && <SubscriptionBadge status={status} />}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Expires</span>
                    <span className="text-slate-800">
                      {subscription ? formatDate(subscription.expiryDate) : "—"}
                    </span>
                  </div>
                  {subscription && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Remaining</span>
                      <span className="text-slate-800">
                        {daysRemaining < 0
                          ? `Expired ${describeDays(daysRemaining)}`
                          : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`}
                      </span>
                    </div>
                  )}
                  <Link
                    href="/subscriptions"
                    className="block pt-1 text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Manage subscription
                  </Link>
                  <p className="pt-1 text-xs text-slate-400">
                    Meta / WhatsApp messaging charges are billed separately by Meta.
                  </p>
                </div>
              </Card>
            </div>
          </div>

          <Card className="mt-6">
            <CardHeader
              title="Recent messages"
              action={
                <Link href="/message-status" className="text-xs font-medium text-indigo-600 hover:underline">
                  View all
                </Link>
              }
            />
            <ul className="divide-y divide-slate-100">
              {(data?.recentMessages ?? []).length === 0 && (
                <li className="px-5 py-6 text-sm text-slate-400">
                  No messages sent yet — try Bulk Sender or a Campaign.
                </li>
              )}
              {data?.recentMessages.map((message) => (
                <li key={message.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                    {(message.recipientName || message.recipientPhone)[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {message.recipientName || message.recipientPhone}
                    </p>
                    <p className="truncate text-xs text-slate-400">{message.preview}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {message.sentAt ? formatDateTime(message.sentAt) : formatDateTime(message.createdAt)}
                  </span>
                  <StatusBadge status={message.status} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
