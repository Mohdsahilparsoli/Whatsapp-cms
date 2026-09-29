import { redirect } from "next/navigation";
import { getSessionAdminId } from "@/lib/adminSession";
import { getSessionClientId } from "@/lib/session";

// Server-side redirect based on the real session cookie — previously this
// always sent everyone to /login, which (being a client component) briefly
// rendered the full sign-in form even for an already-authenticated visitor,
// before its own effect fetched the session and bounced them to /dashboard.
// Deciding here, before any HTML goes out, skips that flash entirely.
export default async function RootPage() {
  const [adminId, clientId] = await Promise.all([getSessionAdminId(), getSessionClientId()]);
  redirect(adminId || clientId ? "/dashboard" : "/login");
}
