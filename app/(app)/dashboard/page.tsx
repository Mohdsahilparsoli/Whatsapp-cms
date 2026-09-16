"use client";

import { useAuth } from "@/lib/auth";
import SuperAdminDashboard from "@/components/dashboard/SuperAdminDashboard";
import ClientAdminDashboard from "@/components/dashboard/ClientAdminDashboard";

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "super_admin" ? <SuperAdminDashboard /> : <ClientAdminDashboard />;
}
