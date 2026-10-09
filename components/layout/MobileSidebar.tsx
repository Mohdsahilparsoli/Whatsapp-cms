"use client";

import { X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { BrandMark, SidebarNav } from "./Sidebar";

export default function MobileSidebar({
  open,
  onClose,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { user } = useAuth();
  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#050a1a] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 pr-2">
          <BrandMark />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <SidebarNav role={user.role} onNavigate={onClose} onLogout={onLogout} />
      </aside>
    </div>
  );
}
