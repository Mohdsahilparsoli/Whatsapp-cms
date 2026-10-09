"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import AuthShell, { AuthLink } from "@/components/auth/AuthShell";
import { ErrorBanner, PasswordField, SubmitButton } from "@/components/auth/fields";

export default function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Couldn't reset your password.");
      else setDone(true);
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(false);
  }

  if (!token) {
    return (
      <AuthShell title="Link not valid" footer={<AuthLink href="/forgot-password">Request a new link</AuthLink>}>
        <p className="text-sm text-[#5b6b66]">This reset link is incomplete. Open the link from your email again, or request a new one.</p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated">
        <div className="flex gap-3 rounded-xl border border-[#d3dcd8] bg-white p-4 text-sm text-[#24342f]">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0b7a57]" />
          <p>Your new password is set. You&apos;ve been signed out everywhere else.</p>
        </div>
        <a href="/login" className="mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-[#0e3b31] text-[15px] font-semibold text-white hover:bg-[#0a2f27]">
          Sign in
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Pick something you haven't used on other sites.">
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <PasswordField label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters, with a letter and a number." />
        <PasswordField label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <SubmitButton busy={busy} busyText="Saving…">
          Save new password
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
