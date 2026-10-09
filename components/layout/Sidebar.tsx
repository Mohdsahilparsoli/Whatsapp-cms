"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import GrowVikaLogo from "@/components/brand/GrowVikaLogo";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPageMeta, navForRole } from "@/lib/nav";
import { useAuth } from "@/lib/auth";
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
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400",
              "relative",
              active
                ? "bg-white/10 text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-[#3f5bff]"
                : "text-slate-300 hover:bg-white/5 hover:text-white",
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
          "mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-red-500/15 hover:text-red-300",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400",
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
    <div className={cn("flex items-center px-5 py-5", collapsed && "justify-center px-2")}>
      <GrowVikaLogo tone="dark" mark={collapsed} className={collapsed ? "text-2xl" : "text-[19px]"} />
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
        // Sticky + full viewport height, same idea as the top header (which is
        // "sticky top-0") — the nav stays pinned in place while the page
        // content scrolls, instead of scrolling away with it.
        "sticky top-0 hidden h-screen shrink-0 border-r border-white/5 bg-[#050a1a] lg:flex lg:flex-col",
        collapsed ? "lg:w-[76px]" : "lg:w-64"
      )}
    >
      <BrandMark collapsed={collapsed} />
      <SidebarNav role={user.role} collapsed={collapsed} onLogout={onLogout} />
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="m-2 flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
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
