import {
  BarChart3,
  Building2,
  CalendarClock,
  CheckSquare,
  CreditCard,
  FileText,
  Inbox,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Send,
  Settings,
  Upload,
  Users,
  Smartphone,
} from "lucide-react";
import type { Role } from "@/types";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const superAdminNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Clients", href: "/clients", icon: Building2 },
  { label: "Subscriptions", href: "/subscriptions", icon: CreditCard },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const clientAdminNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "WhatsApp Account Setup", href: "/whatsapp-setup", icon: Smartphone },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Contact Import", href: "/contacts/import", icon: Upload },
  { label: "Templates", href: "/templates", icon: FileText },
  { label: "Bulk Message Sender", href: "/bulk-sender", icon: Send },
  { label: "Campaigns", href: "/campaigns", icon: MessageSquare },
  { label: "Queue & Rate Limiting", href: "/queue", icon: ListChecks },
  { label: "Message Status", href: "/message-status", icon: CheckSquare },
  { label: "Reports & Analytics", href: "/reports", icon: BarChart3 },
  { label: "WhatsApp Inbox", href: "/inbox", icon: Inbox },
  { label: "Consent & Opt-out", href: "/consent", icon: CalendarClock },
  { label: "Subscription", href: "/subscriptions", icon: CreditCard },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function navForRole(role: Role): NavItem[] {
  return role === "super_admin" ? superAdminNav : clientAdminNav;
}

export interface Crumb {
  label: string;
  href?: string;
}

export interface PageMeta {
  title: string;
  description?: string;
  breadcrumb: Crumb[];
  /** The sidebar entry that should be highlighted for this route. */
  navHref: string;
}

/**
 * Single source of truth for page titles and breadcrumbs. The Topbar reads from
 * here rather than hardcoding a title, so every route renders its own name.
 */
export const pageMeta: Record<string, PageMeta> = {
  "/dashboard": {
    title: "Dashboard",
    description: "Your WhatsApp messaging activity at a glance.",
    breadcrumb: [],
    navHref: "/dashboard",
  },
  "/clients": {
    title: "Clients",
    description: "Create and manage client accounts.",
    breadcrumb: [{ label: "Clients" }],
    navHref: "/clients",
  },
  "/subscriptions": {
    title: "Subscription",
    description: "Trial status, plans, billing, and renewals.",
    breadcrumb: [{ label: "Subscription" }],
    navHref: "/subscriptions",
  },
  "/whatsapp-setup": {
    title: "WhatsApp Account Setup",
    description: "Connect and verify your WhatsApp Business account.",
    breadcrumb: [{ label: "WhatsApp Account Setup" }],
    navHref: "/whatsapp-setup",
  },
  "/contacts": {
    title: "Contacts",
    description: "Your audience, tags, and consent state.",
    breadcrumb: [{ label: "Contacts" }],
    navHref: "/contacts",
  },
  "/contacts/import": {
    title: "Contact Import",
    description: "Bring contacts in from a CSV or Excel file.",
    breadcrumb: [{ label: "Contacts", href: "/contacts" }, { label: "Import" }],
    navHref: "/contacts/import",
  },
  "/templates": {
    title: "Templates",
    description:
      "Meta-approved templates and your own custom templates.",
    breadcrumb: [{ label: "Templates" }],
    navHref: "/templates",
  },
  "/bulk-sender": {
    title: "Bulk Message Sender",
    description:
      "Pick an audience and a template, then review before sending or scheduling.",
    breadcrumb: [{ label: "Bulk Message Sender" }],
    navHref: "/bulk-sender",
  },
  "/campaigns": {
    title: "Campaign Management",
    description: "Plan, schedule, and track your WhatsApp broadcast campaigns.",
    breadcrumb: [{ label: "Campaigns" }],
    navHref: "/campaigns",
  },
  "/queue": {
    title: "Queue & Rate Limiting",
    description: "Batches waiting to go out and their retry state.",
    breadcrumb: [{ label: "Queue & Rate Limiting" }],
    navHref: "/queue",
  },
  "/message-status": {
    title: "Message Status",
    description: "Per-message delivery, read, and failure state.",
    breadcrumb: [{ label: "Message Status" }],
    navHref: "/message-status",
  },
  "/reports": {
    title: "Reports & Analytics",
    description: "Delivery and engagement trends over time.",
    breadcrumb: [{ label: "Reports & Analytics" }],
    navHref: "/reports",
  },
  "/inbox": {
    title: "WhatsApp Inbox",
    description: "Live chat with contacts who replied.",
    breadcrumb: [{ label: "WhatsApp Inbox" }],
    navHref: "/inbox",
  },
  "/consent": {
    title: "Consent & Opt-out",
    description: "Opt-in sources and opt-out handling.",
    breadcrumb: [{ label: "Consent & Opt-out" }],
    navHref: "/consent",
  },
  "/settings": {
    title: "Settings",
    description: "Account, notification, and workspace preferences.",
    breadcrumb: [{ label: "Settings" }],
    navHref: "/settings",
  },
};

function titleCase(segment: string) {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Resolves the meta for a pathname. Falls back to the closest parent route, then
 * to a title derived from the URL, so a new route never inherits another page's
 * title by accident.
 */
export function getPageMeta(pathname: string): PageMeta {
  const exact = pageMeta[pathname];
  if (exact) return exact;

  const segments = pathname.split("/").filter(Boolean);
  for (let i = segments.length - 1; i > 0; i -= 1) {
    const parentPath = `/${segments.slice(0, i).join("/")}`;
    const parent = pageMeta[parentPath];
    if (parent) {
      return {
        title: titleCase(segments[segments.length - 1]),
        breadcrumb: [
          ...parent.breadcrumb.map((crumb, index) =>
            index === parent.breadcrumb.length - 1
              ? { ...crumb, href: parentPath }
              : crumb
          ),
          { label: titleCase(segments[segments.length - 1]) },
        ],
        navHref: parent.navHref,
      };
    }
  }

  return {
    title: segments.length ? titleCase(segments[segments.length - 1]) : "Dashboard",
    breadcrumb: segments.map((segment) => ({ label: titleCase(segment) })),
    navHref: pathname,
  };
}

/** Kept for backwards compatibility — derived from `pageMeta`. */
export const pageTitles: Record<string, string> = Object.fromEntries(
  Object.entries(pageMeta).map(([href, meta]) => [href, meta.title])
);

/**
 * Paid CMS areas. These are blocked in the demo once a client's trial or plan
 * has lapsed; Dashboard, Subscription, and Settings stay reachable so the client
 * can always get back to a plan.
 */
export const paidFeaturePaths = [
  "/whatsapp-setup",
  "/contacts",
  "/templates",
  "/bulk-sender",
  "/campaigns",
  "/queue",
  "/message-status",
  "/reports",
  "/inbox",
  "/consent",
];

export function isPaidFeaturePath(pathname: string) {
  return paidFeaturePaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}
