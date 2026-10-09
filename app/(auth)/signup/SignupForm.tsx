"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import AuthShell, { AuthLink } from "@/components/auth/AuthShell";
import SocialButtons from "@/components/auth/SocialButtons";
import { ErrorBanner, PasswordField, SubmitButton, TextField } from "@/components/auth/fields";
import { TRIAL_DAYS } from "@/data/plans";

type Errors = Partial<Record<"name" | "email" | "phone" | "userId" | "password", string>>;

export default function SignupForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [v, setV] = useState({ name: "", email: "", phone: "", userId: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV((p) => ({ ...p, [k]: e.target.value }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const local: Errors = {};
    if (v.name.trim().length < 2) local.name = "Enter your business or full name.";
    if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) local.email = "Enter a valid email address.";
    if (!/^[a-z0-9_]{4,20}$/i.test(v.userId.trim())) local.userId = "Use 4–20 letters, numbers or underscores.";
    if (v.password.length < 8) local.password = "Use at least 8 characters.";
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const data = await res.json();
      if (!res.ok) {
        setBusy(false);
        if (data.errors) setErrors(data.errors);
        else setFormError(data.error ?? "Couldn't create your account. Try again.");
        return;
      }
      // The account exists and a session cookie is set; this loads the user
      // into the app state too.
      const r = await login(v.userId.trim(), v.password, true);
      if ("error" in r) {
        setBusy(false);
        setFormError("Account created. Sign in to continue.");
        router.push("/login");
        return;
      }
      router.push("/dashboard");
    } catch {
      setBusy(false);
      setFormError("Could not reach the server. Check your connection and try again.");
    }
  }

  return (
    <AuthShell
      title="Start your free trial"
      subtitle={`${TRIAL_DAYS} days free. No card needed.`}
      footer={
        <>
          Already have an account? <AuthLink href="/login">Sign in</AuthLink>
        </>
      }
    >
      <SocialButtons verb="Sign up" />
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <ErrorBanner>{formError}</ErrorBanner>}
        <TextField label="Business or full name" autoComplete="organization" value={v.name} onChange={set("name")} error={errors.name} />
        <TextField label="Work email" type="email" autoComplete="email" value={v.email} onChange={set("email")} error={errors.email} placeholder="you@company.com" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="User ID" autoComplete="username" value={v.userId} onChange={set("userId")} error={errors.userId} />
          <TextField label="Phone (optional)" type="tel" autoComplete="tel" value={v.phone} onChange={set("phone")} error={errors.phone} />
        </div>
        <PasswordField
          label="Password"
          autoComplete="new-password"
          value={v.password}
          onChange={set("password")}
          error={errors.password}
          hint="At least 8 characters, with a letter and a number."
        />
        <div className="pt-1">
          <SubmitButton busy={busy} busyText="Creating your account…">
            Create account
          </SubmitButton>
        </div>
      </form>
    </AuthShell>
  );
}
