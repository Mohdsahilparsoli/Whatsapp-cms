"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Menu, User } from "lucide-react";
import { getPageMeta } from "@/lib/nav";
import { roleLabel, useAuth } from "@/lib/auth";
import TrialReminder, {
  TrialReminderCompact,
} from "@/components/subscription/TrialReminder";

const notifications = [
  { id: "n1", text: "Campaign “Festive Drop 2026” is 74% complete", time: "10 min ago" },
  { id: "n2", text: "3 messages failed in the last batch", time: "38 min ago" },
  { id: "n3", text: "Template “appointment_reminder” is pending review", time: "2 hours ago" },
];

export default function Topbar({
  onMenuClick,
  onLogout,
}: {
  onMenuClick: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [openMenu, setOpenMenu] = useState<"none" | "bell" | "profile">("none");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpenMenu("none");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Title and breadcrumb come from the route's own metadata, so each page
  // renders its own name rather than a shared hardcoded one.
  const { title, breadcrumb } = getPageMeta(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-slate-900">{title}</h1>
        <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-xs text-slate-400 sm:flex">
          <Link href="/dashboard" className="hover:text-slate-600">
            Home
          </Link>
          {breadcrumb.map((crumb, index) => (
            <span key={crumb.label + index} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-slate-600">
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="relative flex items-center gap-1" ref={wrapperRef}>
        <TrialReminder />
        <TrialReminderCompact />

        <button
          type="button"
          aria-label="Notifications"
          aria-expanded={openMenu === "bell"}
          onClick={() => setOpenMenu(openMenu === "bell" ? "none" : "bell")}
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-600" />
        </button>

        <button
          type="button"
          aria-label="Profile menu"
          aria-expanded={openMenu === "profile"}
          onClick={() => setOpenMenu(openMenu === "profile" ? "none" : "profile")}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
            {user?.name?.[0] ?? "U"}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-xs font-medium text-slate-800">{user?.name}</span>
            <span className="block text-[11px] text-slate-400">
              {user ? roleLabel(user.role) : ""}
            </span>
          </span>
        </button>

        {openMenu === "bell" && (
          <div className="absolute right-0 top-12 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            <p className="px-2 py-1.5 text-xs font-semibold text-slate-500">Notifications</p>
            {notifications.map((item) => (
              <div key={item.id} className="rounded-lg px-2 py-2 hover:bg-slate-50">
                <p className="text-xs text-slate-700">{item.text}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{item.time}</p>
              </div>
            ))}
          </div>
        )}

        {openMenu === "profile" && (
          <div className="absolute right-0 top-12 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <div className="px-2.5 py-2">
              <p className="text-xs font-medium text-slate-800">{user?.name}</p>
              <p className="text-[11px] text-slate-400">{user?.email}</p>
            </div>
            <Link
              href="/settings"
              onClick={() => setOpenMenu("none")}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-600 hover:bg-slate-50"
            >
              <User className="h-3.5 w-3.5" /> Profile settings
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-red-600 hover:bg-red-50"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
