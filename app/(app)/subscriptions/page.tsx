"use client";

import { useMemo, useState } from "react";
import { CalendarClock, CreditCard, RotateCcw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import SearchInput from "@/components/ui/SearchInput";
import Tabs from "@/components/ui/Tabs";
import StatusBadge from "@/components/ui/StatusBadge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DemoNotice from "@/components/ui/DemoNotice";
import InlineAlert from "@/components/ui/InlineAlert";
import PlanCard from "@/components/subscription/PlanCard";
import PlanComparison from "@/components/subscription/PlanComparison";
import CheckoutModal from "@/components/subscription/CheckoutModal";
import SubscriptionBadge from "@/components/subscription/SubscriptionBadge";
import SubscriptionHistoryTable from "@/components/subscription/SubscriptionHistoryTable";
import { BILLING_NOTICE, LIMITS_NOTICE, TRIAL_DAYS, getPlan, plans } from "@/data/plans";
import { useAuth } from "@/lib/auth";
import { getPageMeta } from "@/lib/nav";
import {
  statusFor,
  statusLabels,
  toHistoryEntry,
  useSubscription,
} from "@/lib/subscription";
import { describeDays, formatCurrency, formatDate } from "@/lib/utils";
import type { ClientSubscription, Plan, SubscriptionStatus } from "@/types";

type AdminAction = "renew" | "suspend" | "activate";

export default function SubscriptionsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const meta = getPageMeta("/subscriptions");

  const {
    all,
    current,
    history,
    daysRemaining,
    status,
    subscribe,
    renew,
    setSuspended,
    simulateTrial,
    resetDemoData,
  } = useSubscription();

  const [checkout, setCheckout] = useState<{
    plan: Plan;
    mode: "choose" | "upgrade" | "renew";
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function completePurchase(plan: Plan) {
    subscribe(plan.id);
    setToast(
      `Payment completed (demo). Your ${plan.name} plan is active for one year.`
    );
  }

  return (
    <div>
      <PageHeader
        title={isSuperAdmin ? "Subscriptions" : meta.title}
        description={
          isSuperAdmin
            ? "Every client's plan, billing state, and CMS access."
            : meta.description
        }
      />

      <DemoNotice>
        Frontend demo only. No payment gateway is connected — choosing or renewing
        a plan updates this browser session and nothing is charged.
      </DemoNotice>

      {toast && (
        <InlineAlert
          tone="success"
          className="mb-5"
          action={
            <Button size="sm" onClick={() => setToast(null)}>
              Dismiss
            </Button>
          }
        >
          {toast}
        </InlineAlert>
      )}

      {!isSuperAdmin && current && (
        <ClientSubscriptionPanel
          subscription={current}
          status={status ?? "trial"}
          daysRemaining={daysRemaining}
          onUpgrade={(plan) =>
            setCheckout({ plan, mode: current.isTrial ? "choose" : "upgrade" })
          }
          onRenew={() => {
            const plan = getPlan(current.planId) ?? plans[0];
            setCheckout({ plan, mode: "renew" });
          }}
        />
      )}

      <section className="mt-6">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Annual CMS plans
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{LIMITS_NOTICE}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlan={!isSuperAdmin && current?.planId === plan.id}
              ctaLabel={current?.isTrial ? "Choose Plan" : "Upgrade Plan"}
              onSelect={
                isSuperAdmin
                  ? undefined
                  : (selected) =>
                      setCheckout({
                        plan: selected,
                        mode: current?.isTrial ? "choose" : "upgrade",
                      })
              }
            />
          ))}
        </div>
      </section>

      <InlineAlert tone="warning" title="Billing notice" className="mt-5">
        {BILLING_NOTICE}
      </InlineAlert>

      <section className="mt-6">
        <PlanComparison currentPlanId={current?.planId ?? null} />
      </section>

      {isSuperAdmin ? (
        <section className="mt-6 space-y-6">
          <AllClientsTable
            subscriptions={all}
            onRenew={renew}
            onSuspend={setSuspended}
          />
          <SubscriptionHistoryTable
            entries={history}
            showClientColumn
            showSearch
            title="Subscription history — all clients"
          />
        </section>
      ) : (
        <section className="mt-6">
          <SubscriptionHistoryTable
            entries={
              history.length > 0
                ? history
                : current
                  ? [toHistoryEntry(current, `h-${current.clientId}`)]
                  : []
            }
          />
        </section>
      )}

      {!isSuperAdmin && (
        <DemoControls
          onSimulate={(days) => {
            simulateTrial(days);
            setToast(null);
          }}
          onReset={() => {
            resetDemoData();
            setToast(null);
          }}
        />
      )}

      <CheckoutModal
        plan={checkout?.plan ?? null}
        mode={checkout?.mode}
        open={Boolean(checkout)}
        onClose={() => setCheckout(null)}
        onConfirm={completePurchase}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Client Admin — current plan / trial summary
 * ------------------------------------------------------------------ */

function ClientSubscriptionPanel({
  subscription,
  status,
  daysRemaining,
  onUpgrade,
  onRenew,
}: {
  subscription: ClientSubscription;
  status: SubscriptionStatus;
  daysRemaining: number;
  onUpgrade: (plan: Plan) => void;
  onRenew: () => void;
}) {
  const plan = getPlan(subscription.planId);
  const expired = status === "expired";
  const suspended = status === "suspended";
  const needsRenewal = expired || status === "expiring";

  return (
    <div className="space-y-5">
      {expired && (
        <InlineAlert tone="error" title="Subscription Expired">
          Your {subscription.isTrial ? `${TRIAL_DAYS}-day free trial` : "plan"}{" "}
          ended on {formatDate(subscription.expiryDate)}. Paid CMS features are
          locked until you choose a plan below.
        </InlineAlert>
      )}

      {suspended && (
        <InlineAlert tone="error" title="Subscription Suspended">
          Super Admin has suspended this account. Paid CMS features are
          unavailable until it is reactivated.
        </InlineAlert>
      )}

      {status === "expiring" && (
        <InlineAlert tone="warning" title="Expiring Soon">
          Your plan expires {describeDays(daysRemaining)} on{" "}
          {formatDate(subscription.expiryDate)}. Renew to avoid losing access.
        </InlineAlert>
      )}

      {status === "trial" && (
        <InlineAlert tone="info" title={`${TRIAL_DAYS}-day free CMS trial`}>
          You are on the free trial. It expires {describeDays(daysRemaining)} on{" "}
          {formatDate(subscription.expiryDate)}. Choose a plan before then to keep
          your access.
        </InlineAlert>
      )}

      <Card>
        <CardHeader
          title="Current subscription"
          description={
            subscription.isTrial
              ? "Free trial — no payment collected"
              : "Annual CMS plan, billed yearly"
          }
          action={<SubscriptionBadge status={status} />}
        />
        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field
            icon={CreditCard}
            label="Plan"
            value={plan ? plan.name : "Free Trial"}
            hint={plan ? `${formatCurrency(plan.price)} / year` : "No charge"}
          />
          <Field
            icon={CalendarClock}
            label={subscription.isTrial ? "Trial start date" : "Subscription start"}
            value={formatDate(subscription.startDate)}
          />
          <Field
            icon={CalendarClock}
            label={subscription.isTrial ? "Trial expiry date" : "Renewal date"}
            value={formatDate(subscription.expiryDate)}
            hint={
              daysRemaining < 0
                ? `Expired ${describeDays(daysRemaining)}`
                : daysRemaining === 0
                  ? "Expires today"
                  : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`
            }
          />
          <div className="space-y-2">
            <div>
              <p className="text-xs font-medium text-slate-500">Payment status</p>
              <div className="mt-1">
                {subscription.paymentStatus === "not_required" ? (
                  <span className="text-sm text-slate-500">
                    Not required (trial)
                  </span>
                ) : (
                  <StatusBadge status={subscription.paymentStatus} />
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Access status</p>
              <div className="mt-1">
                <SubscriptionBadge status={status} />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-3">
          <Button
            variant="primary"
            onClick={() => onUpgrade(plans.find((p) => p.id === "growth") ?? plans[0])}
          >
            {subscription.isTrial ? "Choose Plan" : "Upgrade Plan"}
          </Button>
          {needsRenewal && !suspended && (
            <Button onClick={onRenew}>Renew Plan</Button>
          )}
          <p className="text-xs text-slate-400">
            Access status: {statusLabels[status]}
          </p>
        </div>
      </Card>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 rounded-lg bg-indigo-50 p-1.5 text-indigo-600">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Super Admin — every client's subscription
 * ------------------------------------------------------------------ */

function AllClientsTable({
  subscriptions,
  onRenew,
  onSuspend,
}: {
  subscriptions: ClientSubscription[];
  onRenew: (clientId: string) => void;
  onSuspend: (clientId: string, suspended: boolean) => void;
}) {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<{
    sub: ClientSubscription;
    action: AdminAction;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subscriptions.filter((sub) => {
      const matchesTab = tab === "all" || statusFor(sub) === tab;
      const matchesQuery = !q || sub.clientName.toLowerCase().includes(q);
      return matchesTab && matchesQuery;
    });
  }, [subscriptions, tab, query]);

  function applyAction() {
    if (!confirm) return;
    const { sub, action } = confirm;
    if (action === "renew") {
      onRenew(sub.clientId);
      setNotice(`${sub.clientName} renewed for another year (demo).`);
    } else {
      onSuspend(sub.clientId, action === "suspend");
      setNotice(
        `${sub.clientName} ${action === "suspend" ? "suspended" : "reactivated"} (demo).`
      );
    }
  }

  const columns: Column<ClientSubscription>[] = [
    {
      key: "client",
      header: "Client",
      render: (row) => (
        <span className="font-medium text-slate-900">{row.clientName}</span>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      render: (row) => {
        const plan = getPlan(row.planId);
        return (
          <div>
            <p className="text-sm text-slate-800">
              {row.isTrial ? "Free Trial" : (plan?.name ?? "—")}
            </p>
            <p className="text-xs text-slate-400">
              {plan ? `${formatCurrency(plan.price)} / year` : "No charge"}
            </p>
          </div>
        );
      },
    },
    { key: "start", header: "Start date", render: (row) => formatDate(row.startDate) },
    {
      key: "expiry",
      header: "Expiry date",
      render: (row) => formatDate(row.expiryDate),
    },
    {
      key: "payment",
      header: "Payment status",
      render: (row) =>
        row.paymentStatus === "not_required" ? (
          <span className="text-xs text-slate-400">Not required</span>
        ) : (
          <StatusBadge status={row.paymentStatus} />
        ),
    },
    {
      key: "access",
      header: "Access status",
      render: (row) => <SubscriptionBadge status={statusFor(row)} />,
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" onClick={() => setConfirm({ sub: row, action: "renew" })}>
            Renew
          </Button>
          {row.suspended ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setConfirm({ sub: row, action: "activate" })}
            >
              Activate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="danger"
              onClick={() => setConfirm({ sub: row, action: "suspend" })}
            >
              Suspend
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-900">
          All client subscriptions
        </h3>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search clients"
          className="w-full sm:w-64"
        />
      </div>

      {notice && (
        <div className="px-5 pt-3">
          <InlineAlert
            tone="success"
            action={
              <Button size="sm" onClick={() => setNotice(null)}>
                Dismiss
              </Button>
            }
          >
            {notice}
          </InlineAlert>
        </div>
      )}

      <div className="px-5 pt-3">
        <Tabs
          tabs={[
            { label: "All", value: "all", count: subscriptions.length },
            {
              label: "Active",
              value: "active",
              count: subscriptions.filter((s) => statusFor(s) === "active").length,
            },
            {
              label: "Free Trial",
              value: "trial",
              count: subscriptions.filter((s) => statusFor(s) === "trial").length,
            },
            {
              label: "Expiring Soon",
              value: "expiring",
              count: subscriptions.filter((s) => statusFor(s) === "expiring").length,
            },
            {
              label: "Expired",
              value: "expired",
              count: subscriptions.filter((s) => statusFor(s) === "expired").length,
            },
            {
              label: "Suspended",
              value: "suspended",
              count: subscriptions.filter((s) => statusFor(s) === "suspended").length,
            },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.clientId}
        emptyTitle="No subscriptions in this view"
        emptyDescription="Switch tabs or clear the search to see other subscription states."
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.action === "renew"
            ? "Renew subscription"
            : confirm?.action === "suspend"
              ? "Suspend access"
              : "Reactivate access"
        }
        message={
          confirm?.action === "renew"
            ? `Extend ${confirm.sub.clientName} by one year? Payment is recorded as paid in this demo.`
            : confirm?.action === "suspend"
              ? `${confirm?.sub.clientName} will lose CMS access until reactivated.`
              : `${confirm?.sub.clientName} will regain access immediately.`
        }
        confirmLabel={
          confirm?.action === "renew"
            ? "Renew"
            : confirm?.action === "suspend"
              ? "Suspend"
              : "Activate"
        }
        destructive={confirm?.action === "suspend"}
        onConfirm={applyAction}
        onClose={() => setConfirm(null)}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Demo helpers
 * ------------------------------------------------------------------ */

function DemoControls({
  onSimulate,
  onReset,
}: {
  onSimulate: (daysRemaining: number) => void;
  onReset: () => void;
}) {
  return (
    <Card className="mt-6">
      <CardHeader
        title="Demo controls"
        description="Frontend-only helpers for previewing each subscription state. Not part of the product."
      />
      <div className="flex flex-wrap gap-2 px-5 py-4">
        <Button size="sm" onClick={() => onSimulate(TRIAL_DAYS)}>
          New trial ({TRIAL_DAYS} days left)
        </Button>
        <Button size="sm" onClick={() => onSimulate(3)}>
          Trial expiring soon (3 days)
        </Button>
        <Button size="sm" onClick={() => onSimulate(0)}>
          Trial expires today
        </Button>
        <Button size="sm" onClick={() => onSimulate(-1)}>
          Trial expired
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset demo data
        </Button>
      </div>
    </Card>
  );
}
