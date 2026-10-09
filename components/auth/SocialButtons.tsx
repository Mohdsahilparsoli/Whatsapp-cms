const items = [
  {
    id: "google",
    label: "Google",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.600-.2-2.300H12v4.500h6.500a5.600 5.600 0 0 1-2.400 3.700v3h3.900c2.300-2.100 3.500-5.200 3.500-8.900Z" />
        <path fill="#34A853" d="M12 24c3.200 0 6-1.100 7.900-2.900l-3.900-3c-1.100.7-2.500 1.200-4 1.200-3.100 0-5.700-2.100-6.600-4.900H1.400v3.100A12 12 0 0 0 12 24Z" />
        <path fill="#FBBC05" d="M5.400 14.300a7.200 7.200 0 0 1 0-4.600V6.600H1.400a12 12 0 0 0 0 10.800l4-3.100Z" />
        <path fill="#EA4335" d="M12 4.800c1.800 0 3.300.6 4.600 1.800l3.400-3.400A12 12 0 0 0 1.400 6.600l4 3.100C6.300 6.900 8.900 4.800 12 4.800Z" />
      </svg>
    ),
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.900 11.900v-8.400H7.100V12h3V9.400c0-3 1.800-4.700 4.500-4.700 1.300 0 2.700.2 2.700.2v3h-1.500c-1.500 0-2 .9-2 1.900V12h3.400l-.5 3.500h-2.800v8.400A12 12 0 0 0 24 12Z" />
      </svg>
    ),
  },
];

export default function SocialButtons({
  providers,
  verb = "Continue",
}: {
  providers: string[];
  verb?: "Continue" | "Sign up";
}) {
  const shown = items.filter((p) => providers.includes(p.id));
  if (shown.length === 0) return null;
  return (
    <div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((p) => (
          <a
            key={p.id}
            href={`/api/auth/oauth/${p.id}`}
            aria-label={`${verb} with ${p.label}`}
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[#d6d9e5] bg-white text-sm font-medium text-[#2f3752] transition-colors hover:border-[#9ba3c0] hover:bg-[#f1f2f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3f55f0]"
          >
            {p.icon}
            <span className="hidden sm:inline">{p.label}</span>
          </a>
        ))}
      </div>
      <div className="my-6 flex items-center gap-3 text-xs text-[#8f96ae]" role="separator">
        <span className="h-px flex-1 bg-[#dfe2eb]" />
        or with your email
        <span className="h-px flex-1 bg-[#dfe2eb]" />
      </div>
    </div>
  );
}
