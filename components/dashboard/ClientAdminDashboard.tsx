"use client";

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
import DemoNotice from "@/components/ui/DemoNotice";
import Button from "@/components/ui/Button";
import { campaigns, conversations } from "@/data/campaigns";
import { contacts } from "@/data/contacts";
import { clients } from "@/data/clients";
import { getPlan } from "@/data/plans";
import SubscriptionBadge from "@/components/subscription/SubscriptionBadge";
import { useSubscription } from "@/lib/subscription";
import { describeDays, formatCurrency, formatDate, formatNumber, percent } from "@/lib/utils";
import type { MockCampaign } from "@/types";

export default function ClientAdminDashboard() {
  const account = clients.find((c) => c.userId === "clientdemo")!;
  const { current: subscription, status, daysRemaining } = useSubscription();
  const plan = getPlan(subscription?.planId);
  const sent = campaigns.reduce((s, c) => s + c.sent, 0);
  const delivered = campaigns.reduce((s, c) => s + c.delivered, 0);
  const read = campaigns.reduce((s, c) => s + c.read, 0);
  const failed = campaigns.reduce((s, c) => s + c.failed, 0);
  const activeCampaigns = campaigns.filter(
    (c) => c.status === "running" || c.status === "scheduled"
  ).length;

  const columns: Column<MockCampaign>[] = [
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
              style={{ width: `${percent(row.sent, row.audienceSize)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {percent(row.sent, row.audienceSize)}%
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${account.name}`}
        description="Your WhatsApp messaging activity at a glance."
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

      <DemoNotice>
        This is a frontend demo. Messages are not actually sent and no WhatsApp Cloud API account is
        connected.
      </DemoNotice>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total contacts" value={formatNumber(contacts.length * 135)} icon={Users} />
        <StatCard label="Active campaigns" value={activeCampaigns} icon={MessageSquare} />
        <StatCard label="Messages sent" value={formatNumber(sent)} icon={Send} />
        <StatCard label="Delivered" value={formatNumber(delivered)} icon={CheckCheck} tone="positive" />
        <StatCard label="Read" value={formatNumber(read)} icon={Eye} />
        <StatCard label="Failed" value={formatNumber(failed)} icon={XCircle} tone="negative" />
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
          <DataTable columns={columns} rows={campaigns.slice(0, 5)} rowKey={(r) => r.id} />
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="WhatsApp connection" />
            <div className="space-y-2.5 px-5 py-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <StatusBadge status="active" label="Connected (demo)" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Business number</span>
                <span className="text-slate-800">+91 90000 00000</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Quality rating</span>
                <span className="text-slate-800">High</span>
              </div>
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
          title="Recent inbox conversations"
          action={
            <Link href="/inbox" className="text-xs font-medium text-indigo-600 hover:underline">
              Open inbox
            </Link>
          }
        />
        <ul className="divide-y divide-slate-100">
          {conversations.slice(0, 4).map((conversation) => (
            <li key={conversation.id} className="flex items-center gap-3 px-5 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                {conversation.contactName[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {conversation.contactName}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {conversation.messages[conversation.messages.length - 1]?.text}
                </p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{conversation.lastMessageAt}</span>
              {conversation.unread > 0 && (
                <span className="shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[11px] text-white">
                  {conversation.unread}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
