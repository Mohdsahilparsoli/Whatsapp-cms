import type { Plan, PlanId } from "@/types";

/** Length of the free CMS trial given to every new client account. */
export const TRIAL_DAYS = 14;

/**
 * Proposed annual CMS subscription prices. Feature limits are indicative only —
 * Super Admin can configure the real limits later.
 */
export const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 2999,
    tagline: "For small teams running their first WhatsApp campaigns.",
    features: [
      "Core CMS access",
      "Contact import and contact management",
      "Approved WhatsApp template management",
      "Basic campaigns and reports",
      "Standard queue and message status view",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 7999,
    tagline: "For teams that need custom templates and scheduling.",
    highlight: true,
    features: [
      "Everything in Starter",
      "Custom template builder",
      "Campaign scheduling",
      "Advanced reports and analytics",
      "WhatsApp Inbox / live chat",
      "Retry and opt-out management",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: 14999,
    tagline: "For businesses managing larger campaigns.",
    supportLabel: "Priority support",
    features: [
      "Everything in Growth",
      "Higher campaign and contact limits",
      "Advanced campaign management",
      "Priority support",
      "More detailed analytics and reporting",
      "Suitable for businesses managing larger campaigns",
    ],
  },
];

export function getPlan(planId: PlanId | null | undefined): Plan | null {
  if (!planId) return null;
  return plans.find((plan) => plan.id === planId) ?? null;
}

export function planName(planId: PlanId | null | undefined) {
  return getPlan(planId)?.name ?? "Free Trial";
}

export function planPrice(planId: PlanId | null | undefined) {
  return getPlan(planId)?.price ?? 0;
}

/** Row-per-capability matrix used by the plan comparison table. */
export const planComparison: {
  capability: string;
  values: Record<PlanId, string>;
}[] = [
  {
    capability: "Core CMS access",
    values: { starter: "Yes", growth: "Yes", business: "Yes" },
  },
  {
    capability: "Contact import & management",
    values: { starter: "Yes", growth: "Yes", business: "Yes" },
  },
  {
    capability: "Approved template management",
    values: { starter: "Yes", growth: "Yes", business: "Yes" },
  },
  {
    capability: "Campaigns & reports",
    values: { starter: "Basic", growth: "Advanced", business: "Advanced+" },
  },
  {
    capability: "Queue & message status",
    values: { starter: "Standard", growth: "Standard", business: "Standard" },
  },
  {
    capability: "Custom template builder",
    values: { starter: "—", growth: "Yes", business: "Yes" },
  },
  {
    capability: "Campaign scheduling",
    values: { starter: "—", growth: "Yes", business: "Yes" },
  },
  {
    capability: "WhatsApp Inbox / live chat",
    values: { starter: "—", growth: "Yes", business: "Yes" },
  },
  {
    capability: "Retry & opt-out management",
    values: { starter: "—", growth: "Yes", business: "Yes" },
  },
  {
    capability: "Campaign & contact limits",
    values: { starter: "Standard", growth: "Standard", business: "Higher" },
  },
  {
    capability: "Analytics depth",
    values: { starter: "Basic", growth: "Advanced", business: "Detailed" },
  },
  {
    capability: "Support",
    values: { starter: "Standard", growth: "Standard", business: "Priority" },
  },
];

export const BILLING_NOTICE =
  "Your CMS subscription covers access to this platform only. Meta / WhatsApp Business Platform messaging charges are separate and are not included in these plan prices.";

export const LIMITS_NOTICE =
  "These are proposed CMS subscription prices. Actual feature limits can be configured later by Super Admin.";
