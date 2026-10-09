"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import AuthShell, { AuthLink } from "@/components/auth/AuthShell";
import SocialButtons from "@/components/auth/SocialButtons";
import { ErrorBanner, PasswordField, SubmitButton, TextField } from "@/components/auth/fields";

export default function LoginForm({ providers, initialError = null }: { providers: string[]; initialError?: string | null }) {
  const router = useRouter();
  const { login, user, ready } = useAuth();

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ userId?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(initialError);

  // Safety net: the server page already redirects signed-in visitors.
  useEffect(() => {
    if (ready && user) router.replace("/dashboard");
  }, [ready, user, router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const errors: { userId?: string; password?: string } = {};
    if (!userId.trim()) errors.userId = "Enter your email or User ID.";
    if (!password.trim()) errors.password = "Enter your password.";
    setFieldErrors(errors);
    if (errors.userId || errors.password) return;

    setSubmitting(true);
    const result = await login(userId, password, remember);
    if ("error" in result) {
      setSubmitting(false);
      setFormError(result.error);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your campaigns, templates and inbox."
      footer={
        <>
          New to GrowVika? <AuthLink href="/signup">Create a free account</AuthLink>
        </>
      }
    >
      <SocialButtons providers={providers} />
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && <ErrorBanner>{formError}</ErrorBanner>}
        <TextField
          label="Email or User ID"
          name="userId"
          autoComplete="username"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            if (fieldErrors.userId) setFieldErrors((p) => ({ ...p, userId: undefined }));
          }}
          error={fieldErrors.userId}
          placeholder="you@company.com"
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
          }}
          error={fieldErrors.password}
          placeholder="Enter your password"
          right={
            <Link href="/forgot-password" className="text-sm font-medium text-[#3f55f0] underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          }
        />
        <label className="flex select-none items-center gap-2.5 text-sm text-[#2f3752]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-[#c6cad9] accent-[#3f55f0]"
          />
          Keep me signed in
        </label>
        <SubmitButton busy={submitting} busyText="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
