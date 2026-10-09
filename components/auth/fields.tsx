"use client";

import { useId, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const inputBase =
  "h-11 w-full rounded-lg border bg-white px-3.5 text-[15px] text-[#0c1b17] placeholder:text-[#8a9a95] transition-shadow focus:outline-none focus:ring-4";
const ok = "border-[#d3dcd8] focus:border-[#0e3b31] focus:ring-[#0e3b31]/10";
const bad = "border-red-400 focus:border-red-500 focus:ring-red-100";

export function TextField({
  label,
  error,
  hint,
  right,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; right?: React.ReactNode }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-[#24342f]">
          {label}
        </label>
        {right}
      </div>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
        className={`mt-1.5 ${inputBase} ${error ? bad : ok}`}
        {...props}
      />
      {error ? (
        <p id={`${id}-e`} className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p id={`${id}-h`} className="mt-1.5 text-xs text-[#6b7b76]">{hint}</p>
      ) : null}
    </div>
  );
}

export function PasswordField({
  label,
  error,
  hint,
  right,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; error?: string; hint?: string; right?: React.ReactNode }) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-[#24342f]">
          {label}
        </label>
        {right}
      </div>
      <div className="relative mt-1.5">
        <input
          id={id}
          type={show ? "text" : "password"}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
          className={`${inputBase} pr-11 ${error ? bad : ok}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-[#8a9a95] hover:text-[#0c1b17] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0e3b31]"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? (
        <p id={`${id}-e`} className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p id={`${id}-h`} className="mt-1.5 text-xs text-[#6b7b76]">{hint}</p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ busy, children, busyText }: { busy: boolean; children: React.ReactNode; busyText: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0e3b31] px-4 text-[15px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_6px_16px_-6px_rgba(6,36,29,0.55)] transition-colors hover:bg-[#0a2f27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e3b31] disabled:opacity-70"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {busy ? busyText : children}
    </button>
  );
}

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {children}
    </div>
  );
}
