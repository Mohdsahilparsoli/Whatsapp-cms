import Link from "next/link";

function Ticks({ delay }: { delay: string }) {
  return (
    <svg viewBox="0 0 18 11" className="auth-read h-[11px] w-[18px]" style={{ "--d": delay } as React.CSSProperties} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 5.8 4.2 9 10.5 1.8" />
      <path d="M6.4 8.6 7.6 9.8 14 2" />
    </svg>
  );
}

export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#1fb57a" />
      <path d="M20 8.5c-6.1 0-11 4.5-11 10.2 0 2.3.8 4.4 2.2 6.1L10 30.5l5.9-1.6c1.3.6 2.7.9 4.1.9 6.1 0 11-4.5 11-10.2S26 8.5 20 8.500Z" fill="#06241d" />
      <path d="m14.500 21 3.400-3.600 2.600 2.500 4.600-5" fill="none" stroke="#1fb57a" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const RECIPIENTS = [
  { initial: "A", width: "w-24", delay: "1.5s" },
  { initial: "R", width: "w-32", delay: "1.8s" },
  { initial: "S", width: "w-20", delay: "2.1s" },
  { initial: "M", width: "w-28", delay: "2.4s" },
];

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#fafbfa] lg:flex-row">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-[#06241d] text-white lg:flex lg:w-[46%] lg:max-w-[780px] lg:flex-col lg:justify-between lg:px-14 lg:py-12 xl:px-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <BrandMark />
          <div className="leading-tight">
            <div className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">GrowVika</div>
            <div className="text-xs text-white/55">WhatsApp Marketing CMS</div>
          </div>
        </div>

        {/* One message in, many delivered, one reply back */}
        <div className="relative my-10 w-full max-w-[420px] self-center">
          <div className="auth-rise ml-auto w-[78%] rounded-2xl rounded-tr-md bg-[#1fb57a] px-4 py-3 text-[13px] leading-relaxed text-[#04180f]" style={{ "--d": "0.2s" } as React.CSSProperties}>
            Festive week: flat 30% off until Sunday. Tap to see what&apos;s in.
            <span className="mt-1 flex justify-end text-[#04180f]/60">
              <svg viewBox="0 0 18 11" className="h-[11px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M1 5.8 4.2 9 10.5 1.8" />
                <path d="M6.4 8.6 7.6 9.8 14 2" />
              </svg>
            </span>
          </div>

          <div className="ml-auto mr-[38px] h-7 w-px bg-gradient-to-b from-[#1fb57a]/70 to-white/10" aria-hidden />

          <ul className="space-y-2.5">
            {RECIPIENTS.map((r) => (
              <li
                key={r.initial}
                className="auth-rise flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5"
                style={{ "--d": `${Number.parseFloat(r.delay) - 0.55}s` } as React.CSSProperties}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white/80">
                  {r.initial}
                </span>
                <span className={`h-2 rounded-full bg-white/15 ${r.width}`} />
                <span className="ml-auto">
                  <Ticks delay={r.delay} />
                </span>
              </li>
            ))}
          </ul>

          <div className="auth-rise mt-4 w-[66%] rounded-2xl rounded-tl-md bg-white px-4 py-2.5 text-[13px] text-[#0c1b17] shadow-[0_8px_30px_rgba(0,0,0,0.25)]" style={{ "--d": "3.1s" } as React.CSSProperties}>
            Is the offer valid on orders already in the cart?
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-[family-name:var(--font-display)] text-[40px] font-semibold leading-[1.08] tracking-tight xl:text-[46px]">
            Send to thousands.
            <br />
            Reply to each one.
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/60">
            Campaigns, approved templates and a shared inbox for your own WhatsApp Business number.
          </p>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 flex-col px-5 py-8 sm:px-10">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <BrandMark className="h-8 w-8" />
          <span className="font-[family-name:var(--font-display)] text-base font-semibold text-[#0c1b17]">GrowVika</span>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[420px]">
            <h1 className="font-[family-name:var(--font-display)] text-[32px] font-semibold leading-tight tracking-tight text-[#0c1b17]">
              {title}
            </h1>
            {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-[#5b6b66]">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <p className="mt-8 text-center text-sm text-[#5b6b66]">{footer}</p>}
          </div>
        </div>
      </main>
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-[#0b7a57] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0b7a57]">
      {children}
    </Link>
  );
}
