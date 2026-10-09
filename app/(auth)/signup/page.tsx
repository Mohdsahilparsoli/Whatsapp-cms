import { redirect } from "next/navigation";
import { getSessionAdminId } from "@/lib/adminSession";
import { getSessionClientId } from "@/lib/session";
import SignupForm from "./SignupForm";

export const metadata = { title: "Create your account · GrowVika" };

export default async function SignupPage() {
  const [adminId, clientId] = await Promise.all([getSessionAdminId(), getSessionClientId()]);
  if (adminId || clientId) redirect("/dashboard");
  return <SignupForm />;
}
