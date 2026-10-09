import { redirect } from "next/navigation";
import { getSessionAdminId } from "@/lib/adminSession";
import { getSessionClientId } from "@/lib/session";
import { AUTH_ERRORS } from "@/lib/authMessages";
import { configuredProviders } from "@/lib/oauth";
import LoginForm from "./LoginForm";

// Decide server-side, before any HTML goes out, so an already-signed-in
// visitor never sees the form flash before being sent to /dashboard.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [adminId, clientId] = await Promise.all([getSessionAdminId(), getSessionClientId()]);
  if (adminId || clientId) redirect("/dashboard");
  const { error } = await searchParams;
  return <LoginForm providers={configuredProviders()} initialError={error ? (AUTH_ERRORS[error] ?? null) : null} />;
}
