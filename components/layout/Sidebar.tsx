"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPageMeta, navForRole } from "@/lib/nav";
import { roleLabel, useAuth } from "@/lib/auth";
import type { Role } from "@/types";

export function SidebarNav({
  role,
  collapsed = false,
  onNavigate,
  onLogout,
}: {
  role: Role;
  collapsed?: boolean;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const items = navForRole(role);
  // The route's own metadata decides which single sidebar entry is active, so
  // nested routes (e.g. /contacts/import) never highlight two items at once.
  const activeHref = getPageMeta(pathname).navHref;

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3" aria-label="Main">
      {items.map((item) => {
        const active = item.href === activeHref;
        const Icon = item.icon;
        return (
          <Link
            key={item.href + item.label}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
              active
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              collapsed && "justify-center px-2"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={onLogout}
        title={collapsed ? "Logout" : undefined}
        className={cn(
          "mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
          collapsed && "justify-center px-2"
        )}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!collapsed && <span>Logout</span>}
      </button>
    </nav>
  );
}

export function BrandMark({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 px-4 py-4", collapsed && "justify-center px-2")}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white">
        W
      </span>
      {!collapsed && (
        <span className="truncate text-sm font-semibold text-slate-900">
          WhatsApp CMS
        </span>
      )}
    </div>
  );
}

export default function Sidebar({
  collapsed,
  onToggle,
  onLogout,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
}) {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <aside
      className={cn(
        "hidden shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col",
        collapsed ? "lg:w-[76px]" : "lg:w-64"
      )}
    >
      <BrandMark collapsed={collapsed} />
      {!collapsed && (
        <p className="px-4 pb-2 text-xs text-slate-400">{roleLabel(user.role)}</p>
      )}
      <SidebarNav role={user.role} collapsed={collapsed} onLogout={onLogout} />
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="m-2 flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <>
            <PanelLeftClose className="h-4 w-4" /> Collapse
          </>
        )}
      </button>
    </aside>
  );
}
