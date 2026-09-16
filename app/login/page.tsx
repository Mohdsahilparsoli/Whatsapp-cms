"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login, user, ready } = useAuth();

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ userId?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) router.replace("/dashboard");
  }, [ready, user, router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const errors: { userId?: string; password?: string } = {};
    if (!userId.trim()) errors.userId = "Enter your User ID.";
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
    <div className="flex min-h-screen flex-col bg-white lg:flex-row">
      {/* Brand panel */}
      <div className="flex flex-col justify-between bg-slate-900 px-8 py-10 text-white sm:px-12 lg:w-[44%] lg:px-14 lg:py-14">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-sm font-semibold">
            W
          </span>
          <span className="text-sm font-semibold">WhatsApp Marketing CMS</span>
        </div>

        <div className="my-10 flex max-w-[280px] flex-col gap-2 lg:my-0">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-500 px-3.5 py-2 text-xs leading-relaxed">
            Your order is on the way — track it here.
          </div>
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-500 px-3.5 py-2 text-xs leading-relaxed">
            Festive week: flat 30% off until Sunday.
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-2xl rounded-tr-sm bg-white/10 px-3.5 py-2.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70 [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70 [animation-delay:300ms]" />
          </div>
        </div>

        <div className="max-w-sm">
          <h2 className="text-2xl font-semibold leading-snug sm:text-3xl">
            Every campaign starts with a single message.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Sign in to manage broadcasts, templates, contacts, and campaign reporting.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your credentials to open the CMS console.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
            {formError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {formError}
              </div>
            )}

            <div>
              <label htmlFor="userId" className="block text-sm font-medium text-slate-700">
                User ID
              </label>
              <input
                id="userId"
                name="userId"
                type="text"
                autoComplete="username"
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                  if (fieldErrors.userId) setFieldErrors((p) => ({ ...p, userId: undefined }));
                }}
                aria-invalid={Boolean(fieldErrors.userId)}
                aria-describedby={fieldErrors.userId ? "userId-error" : undefined}
                placeholder="e.g. superadmin"
                className={`mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                  fieldErrors.userId
                    ? "border-red-400 focus:ring-red-100"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
                }`}
              />
              {fieldErrors.userId && (
                <p id="userId-error" className="mt-1 text-xs text-red-600">
                  {fieldErrors.userId}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  placeholder="Enter your password"
                  className={`h-10 w-full rounded-lg border bg-white px-3 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                    fieldErrors.password
                      ? "border-red-400 focus:ring-red-100"
                      : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="mt-1 text-xs text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <label className="flex select-none items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Remember me
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-70"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-700">Getting your login</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              <strong>Super Admin:</strong> there is exactly one account, set up from the terminal
              (<code className="rounded bg-slate-200 px-1 py-0.5">npm run create-admin</code>) — ask
              whoever set up this server for the User ID and password.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              <strong>Client Admin:</strong> Super Admin creates your account from the Clients page
              and gives you a User ID and temporary password. Both roles are checked against the
              database — nothing here is a hardcoded demo login anymore.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
