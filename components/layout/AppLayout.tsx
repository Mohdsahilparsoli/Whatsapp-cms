"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import LoadingState from "@/components/ui/LoadingState";
import AccessGate from "@/components/subscription/AccessGate";
import { CampaignStoreProvider } from "@/lib/campaignStore";
import { CustomTemplatesProvider } from "@/lib/customTemplates";
import { SubscriptionProvider } from "@/lib/subscription";
import MobileSidebar from "./MobileSidebar";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white">
          <LoadingState rows={3} label="Checking your session" />
        </div>
      </div>
    );
  }

  // Demo stores live inside the shell so every provider can read the signed-in
  // user and scope its data to that client.
  return (
    <SubscriptionProvider>
      <CustomTemplatesProvider>
        <CampaignStoreProvider>
          <div className="flex min-h-screen bg-slate-50">
            <Sidebar
              collapsed={collapsed}
              onToggle={() => setCollapsed((c) => !c)}
              onLogout={handleLogout}
            />
            <MobileSidebar
              open={mobileOpen}
              onClose={() => setMobileOpen(false)}
              onLogout={handleLogout}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar
                onMenuClick={() => setMobileOpen(true)}
                onLogout={handleLogout}
              />
              <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
                <AccessGate>{children}</AccessGate>
              </main>
            </div>
          </div>
        </CampaignStoreProvider>
      </CustomTemplatesProvider>
    </SubscriptionProvider>
  );
}
