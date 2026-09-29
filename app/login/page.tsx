import { redirect } from "next/navigation";
import { getSessionAdminId } from "@/lib/adminSession";
import { getSessionClientId } from "@/lib/session";
import LoginForm from "./LoginForm";

// Mirrors app/page.tsx: decide server-side, before any HTML goes out, so an
// already-authenticated visitor never sees the sign-in form flash before
// being bounced to /dashboard.
export default async function LoginPage() {
  const [adminId, clientId] = await Promise.all([getSessionAdminId(), getSessionClientId()]);
  if (adminId || clientId) redirect("/dashboard");
  return <LoginForm />;
}
