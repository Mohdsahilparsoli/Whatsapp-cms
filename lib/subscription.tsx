"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { clients } from "@/data/clients";
import { TRIAL_DAYS, getPlan, planName, planPrice } from "@/data/plans";
import { useAuth } from "@/lib/auth";
import {
  addDays,
  addYears,
  daysUntil,
  parseDate,
  startOfToday,
  toISODate,
} from "@/lib/utils";
import type {
  ClientSubscription,
  PlanId,
  SubscriptionHistoryEntry,
  SubscriptionStatus,
} from "@/types";

const STORAGE_KEY = "wacms.demo.subscriptions";

/** A subscription is flagged "expiring soon" this many days before expiry. */
export const EXPIRING_SOON_DAYS = 3;

/* ------------------------------------------------------------------ *
 * Derived status
 * ------------------------------------------------------------------ */

export function statusFor(sub: ClientSubscription): SubscriptionStatus {
  if (sub.suspended) return "suspended";
  const remaining = daysUntil(sub.expiryDate);
  if (remaining < 0) return "expired";
  if (sub.isTrial) return "trial";
  if (remaining <= EXPIRING_SOON_DAYS) return "expiring";
  return "active";
}

export const statusLabels: Record<SubscriptionStatus, string> = {
  trial: "Free Trial",
  active: "Active",
  expiring: "Expiring Soon",
  expired: "Expired",
  suspended: "Suspended",
};

/** Maps our status onto the tone keys StatusBadge already understands. */
export const statusTone: Record<SubscriptionStatus, string> = {
  trial: "scheduled",
  active: "active",
  expiring: "expiring",
  expired: "expired",
  suspended: "suspended",
};

/** Paid CMS features stay locked once a trial or plan has lapsed. */
export function hasCmsAccess(sub: ClientSubscription | null) {
  if (!sub) return true;
  const status = statusFor(sub);
  return status !== "expired" && status !== "suspended";
}

/* ------------------------------------------------------------------ *
 * Seed data
 * ------------------------------------------------------------------ */

/** A brand-new client account: 14-day free CMS trial starting today. */
export function newTrial(clientId: string, clientName: string): ClientSubscription {
  const today = startOfToday();
  return {
    clientId,
    clientName,
    planId: null,
    startDate: toISODate(today),
    expiryDate: toISODate(addDays(today, TRIAL_DAYS)),
    isTrial: true,
    paymentStatus: "not_required",
    suspended: false,
  };
}

/**
 * Demo seed. Dates are generated relative to the real current date so the demo
 * always shows a sensible mix of trial, active, expiring, expired and suspended
 * accounts instead of stale hardcoded values.
 */
function seedSubscriptions(): ClientSubscription[] {
  const today = startOfToday();
  const shift = (days: number) => toISODate(addDays(today, days));

  const overrides: Record<
    string,
    Partial<ClientSubscription> & { startOffset: number; expiryOffset: number }
  > = {
    // Paid, comfortably active.
    c1: { planId: "business", isTrial: false, paymentStatus: "paid", startOffset: -246, expiryOffset: 119 },
    // Paid, inside the "expiring soon" window.
    c2: { planId: "growth", isTrial: false, paymentStatus: "paid", startOffset: -363, expiryOffset: 2 },
    // Paid but payment still pending, expiring shortly.
    c3: { planId: "starter", isTrial: false, paymentStatus: "pending", startOffset: -359, expiryOffset: 6 },
    // Lapsed — access restricted.
    c4: { planId: "starter", isTrial: false, paymentStatus: "overdue", startOffset: -457, expiryOffset: -92 },
    // Paid but suspended by Super Admin.
    c5: { planId: "growth", isTrial: false, paymentStatus: "paid", startOffset: -226, expiryOffset: 139, suspended: true },
    // The demo login: still inside its 14-day free trial (day 5 of 14).
    c6: { planId: null, isTrial: true, paymentStatus: "not_required", startOffset: -4, expiryOffset: 10 },
  };

  return clients.map((client) => {
    const override = overrides[client.id];
    if (!override) return newTrial(client.id, client.name);
    const { startOffset, expiryOffset, ...rest } = override;
    return {
      clientId: client.id,
      clientName: client.name,
      planId: null,
      isTrial: false,
      paymentStatus: "not_required",
      suspended: false,
      ...rest,
      startDate: shift(startOffset),
      expiryDate: shift(expiryOffset),
    } as ClientSubscription;
  });
}

function seedHistory(subs: ClientSubscription[]): SubscriptionHistoryEntry[] {
  return subs.map((sub) => toHistoryEntry(sub, `h-${sub.clientId}`));
}

export function toHistoryEntry(
  sub: ClientSubscription,
  id: string
): SubscriptionHistoryEntry {
  return {
    id,
    clientId: sub.clientId,
    clientName: sub.clientName,
    planId: sub.planId,
    planName: sub.isTrial ? "Free Trial (14 days)" : planName(sub.planId),
    amount: sub.isTrial ? 0 : planPrice(sub.planId),
    startDate: sub.startDate,
    expiryDate: sub.expiryDate,
    paymentStatus: sub.paymentStatus,
    accessStatus: statusFor(sub),
  };
}

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

interface SubscriptionContextValue {
  /** Every client's subscription — Super Admin view. */
  all: ClientSubscription[];
  /** The signed-in Client Admin's subscription, or null for Super Admin. */
  current: ClientSubscription | null;
  history: SubscriptionHistoryEntry[];
  /** Days until the current subscription expires (negative once lapsed). */
  daysRemaining: number;
  status: SubscriptionStatus | null;
  /** False once the current client's trial/plan has lapsed or been suspended. */
  canUsePaidFeatures: boolean;
  /** Completes the demo payment flow and activates a plan for one year. */
  subscribe: (planId: PlanId, clientId?: string) => void;
  /** Extends a subscription by one year and marks it paid (demo). */
  renew: (clientId: string) => void;
  setSuspended: (clientId: string, suspended: boolean) => void;
  /** Demo helper: rewinds/advances the current client's trial. */
  simulateTrial: (daysRemaining: number) => void;
  resetDemoData: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

interface Persisted {
  subs: ClientSubscription[];
  history: SubscriptionHistoryEntry[];
}

/** Reads the saved demo session. Returns null on first run or bad data. */
function restore(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Persisted;
    if (!Array.isArray(saved.subs) || saved.subs.length === 0) return null;
    return {
      subs: saved.subs,
      history: Array.isArray(saved.history) ? saved.history : [],
    };
  } catch {
    return null;
  }
}

export function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  // Restores the previous demo session, falling back to the seed data.
  const [subs, setSubs] = useState<ClientSubscription[]>(
    () => restore()?.subs ?? seedSubscriptions()
  );
  const [history, setHistory] = useState<SubscriptionHistoryEntry[]>(
    () => restore()?.history ?? seedHistory(seedSubscriptions())
  );

  const persist = useCallback(
    (nextSubs: ClientSubscription[], nextHistory: SubscriptionHistoryEntry[]) => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ subs: nextSubs, history: nextHistory } satisfies Persisted)
        );
      } catch {
        // storage unavailable — demo state stays in memory only
      }
    },
    []
  );

  const update = useCallback(
    (
      clientId: string,
      patch: (sub: ClientSubscription) => ClientSubscription,
      logHistory = false
    ) => {
      setSubs((prev) => {
        const next = prev.map((sub) =>
          sub.clientId === clientId ? patch(sub) : sub
        );
        setHistory((prevHistory) => {
          const changed = next.find((sub) => sub.clientId === clientId);
          const nextHistory =
            logHistory && changed
              ? [toHistoryEntry(changed, `h-${clientId}-${Date.now()}`), ...prevHistory]
              : prevHistory.map((entry) =>
                  changed && entry.id === `h-${clientId}`
                    ? toHistoryEntry(changed, entry.id)
                    : entry
                );
          persist(next, nextHistory);
          return nextHistory;
        });
        return next;
      });
    },
    [persist]
  );

  const subscribe = useCallback(
    (planId: PlanId, clientId?: string) => {
      const target = clientId ?? user?.clientId;
      if (!target) return;
      update(
        target,
        (sub) => {
          const today = startOfToday();
          return {
            ...sub,
            planId,
            isTrial: false,
            suspended: false,
            paymentStatus: "paid",
            startDate: toISODate(today),
            expiryDate: toISODate(addYears(today, 1)),
          };
        },
        true
      );
    },
    [update, user?.clientId]
  );

  const renew = useCallback(
    (clientId: string) => {
      update(
        clientId,
        (sub) => {
          const today = startOfToday();
          const from = parseDate(sub.expiryDate);
          // Renew from the expiry date if it is still in the future, else today.
          const base = from && from > today ? from : today;
          return {
            ...sub,
            // A lapsed trial renews onto Starter; paid plans keep their plan.
            planId: sub.planId ?? "starter",
            isTrial: false,
            suspended: false,
            paymentStatus: "paid",
            startDate: toISODate(today),
            expiryDate: toISODate(addYears(base, 1)),
          };
        },
        true
      );
    },
    [update]
  );

  const setSuspended = useCallback(
    (clientId: string, suspended: boolean) => {
      update(clientId, (sub) => ({ ...sub, suspended }));
    },
    [update]
  );

  const simulateTrial = useCallback(
    (remaining: number) => {
      const target = user?.clientId;
      if (!target) return;
      const today = startOfToday();
      update(target, (sub) => ({
        ...sub,
        planId: null,
        isTrial: true,
        suspended: false,
        paymentStatus: "not_required",
        startDate: toISODate(addDays(today, remaining - TRIAL_DAYS)),
        expiryDate: toISODate(addDays(today, remaining)),
      }));
    },
    [update, user?.clientId]
  );

  const resetDemoData = useCallback(() => {
    const fresh = seedSubscriptions();
    const freshHistory = seedHistory(fresh);
    setSubs(fresh);
    setHistory(freshHistory);
    persist(fresh, freshHistory);
  }, [persist]);

  const current = useMemo(() => {
    if (!user || user.role === "super_admin" || !user.clientId) return null;
    return subs.find((sub) => sub.clientId === user.clientId) ?? null;
  }, [subs, user]);

  const value = useMemo<SubscriptionContextValue>(() => {
    const scopedHistory =
      user?.role === "super_admin"
        ? history
        : history.filter((entry) => entry.clientId === user?.clientId);

    return {
      all: subs,
      current,
      history: scopedHistory,
      daysRemaining: current ? daysUntil(current.expiryDate) : 0,
      status: current ? statusFor(current) : null,
      canUsePaidFeatures: hasCmsAccess(current),
      subscribe,
      renew,
      setSuspended,
      simulateTrial,
      resetDemoData,
    };
  }, [
    subs,
    history,
    current,
    user,
    subscribe,
    renew,
    setSuspended,
    simulateTrial,
    resetDemoData,
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx)
    throw new Error("useSubscription must be used inside <SubscriptionProvider>");
  return ctx;
}

/** Copy for the compact header reminder. Returns null when nothing should show. */
export function reminderText(sub: ClientSubscription | null) {
  if (!sub) return null;
  const status = statusFor(sub);
  const days = daysUntil(sub.expiryDate);

  if (status === "suspended") return "Your plan has been suspended";
  if (status === "expired")
    return sub.isTrial ? "Your free trial has expired" : "Your plan has expired";
  if (days === 0)
    return sub.isTrial
      ? "Your free trial expires today"
      : "Your plan expires today";
  if (sub.isTrial) return `Your free trial expires in ${days} days`;
  return `Your plan expires in ${days} days`;
}

export { getPlan };
