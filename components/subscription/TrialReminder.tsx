"use client";

import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  EXPIRING_SOON_DAYS,
  reminderText,
  statusFor,
  useSubscription,
} from "@/lib/subscription";
import { cn } from "@/lib/utils";

/**
 * Sits next to the signed-in user in the Topbar. Client Admin only — a Super
 * Admin has no single client subscription to remind them about.
 */
export default function TrialReminder() {
  const { user } = useAuth();
  const { current, daysRemaining } = useSubscription();

  if (!user || user.role === "super_admin" || !current) return null;

  const status = statusFor(current);
  const text = reminderText(current);
  if (!text) return null;

  // "Expiring soon" styling kicks in at 3 days or less, and once lapsed.
  const urgent =
    status === "expired" ||
    status === "suspended" ||
    daysRemaining <= EXPIRING_SOON_DAYS;

  const Icon = urgent ? AlertTriangle : Clock;

  return (
    <Link
      href="/subscriptions"
      title={`${text} — open Subscription`}
      className={cn(
        "hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:inline-flex",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
        urgent
          ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-[190px] truncate">{text}</span>
    </Link>
  );
}

/** Icon-only variant so small screens still surface an urgent reminder. */
export function TrialReminderCompact() {
  const { user } = useAuth();
  const { current, daysRemaining } = useSubscription();

  if (!user || user.role === "super_admin" || !current) return null;

  const status = statusFor(current);
  const text = reminderText(current);
  if (!text) return null;

  const urgent =
    status === "expired" ||
    status === "suspended" ||
    daysRemaining <= EXPIRING_SOON_DAYS;

  return (
    <Link
      href="/subscriptions"
      aria-label={text}
      title={text}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium sm:hidden",
        urgent
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      {urgent ? (
        <AlertTriangle className="h-3.5 w-3.5" />
      ) : (
        <Clock className="h-3.5 w-3.5" />
      )}
      <span>{daysRemaining < 0 ? "Expired" : `${daysRemaining}d`}</span>
    </Link>
  );
}
