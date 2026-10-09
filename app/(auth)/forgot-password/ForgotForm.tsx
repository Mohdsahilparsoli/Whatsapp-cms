"use client";

import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import AuthShell, { AuthLink } from "@/components/auth/AuthShell";
import { ErrorBanner, SubmitButton, TextField } from "@/components/auth/fields";

export default function ForgotForm() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!identifier.trim()) return setError("Enter your email or User ID.");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong. Try again.");
      else setSent(true);
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <AuthShell title="Check your email" footer={<AuthLink href="/login">Back to sign in</AuthLink>}>
        <div className="flex gap-3 rounded-xl border border-[#d6d9e5] bg-white p-4 text-sm leading-relaxed text-[#2f3752]">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#3f55f0]" />
          <p>
            If an account matches <strong>{identifier.trim()}</strong>, a reset link is on its way. It works once and
            expires in 60 minutes. Check spam if you don&apos;t see it.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email or User ID and we'll send you a link to set a new one."
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <TextField label="Email or User ID" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@company.com" />
        <SubmitButton busy={busy} busyText="Sending link…">
          Send reset link
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
