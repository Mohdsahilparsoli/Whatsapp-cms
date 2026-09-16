"use client";

import { Check, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import { cn, formatCurrency } from "@/lib/utils";
import type { Plan } from "@/types";

export default function PlanCard({
  plan,
  currentPlan = false,
  ctaLabel,
  onSelect,
  disabled = false,
}: {
  plan: Plan;
  /** Marks the plan the client is already on. */
  currentPlan?: boolean;
  ctaLabel?: string;
  onSelect?: (plan: Plan) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        currentPlan
          ? "border-indigo-400 ring-1 ring-indigo-200"
          : plan.highlight
            ? "border-indigo-200"
            : "border-slate-200"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{plan.name}</h3>
          <p className="mt-1 text-xs text-slate-500">{plan.tagline}</p>
        </div>
        {currentPlan ? (
          <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
            Current plan
          </span>
        ) : (
          plan.highlight && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
              <Sparkles className="h-3 w-3" /> Popular
            </span>
          )
        )}
      </div>

      <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
        {formatCurrency(plan.price)}
        <span className="ml-1 text-sm font-normal text-slate-400">/ year</span>
      </p>

      <ul className="mt-4 flex-1 space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {plan.supportLabel && (
        <p className="mt-3 inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {plan.supportLabel}
        </p>
      )}

      {onSelect && (
        <Button
          variant={currentPlan ? "secondary" : plan.highlight ? "primary" : "secondary"}
          className="mt-5 w-full"
          disabled={disabled || currentPlan}
          onClick={() => onSelect(plan)}
        >
          {currentPlan ? "Current plan" : (ctaLabel ?? "Choose plan")}
        </Button>
      )}
    </div>
  );
}
