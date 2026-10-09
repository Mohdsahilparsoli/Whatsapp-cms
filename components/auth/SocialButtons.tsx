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
  {
    id: "apple",
    label: "Apple",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path fill="#000" d="M16.400 12.600c0-2.400 2-3.500 2.100-3.600-1.100-1.700-2.900-1.900-3.500-1.900-1.500-.2-2.900.9-3.700.9s-1.900-.9-3.200-.8c-1.600 0-3.100 1-4 2.400-1.700 3-.4 7.400 1.200 9.800.8 1.200 1.800 2.500 3 2.400 1.200 0 1.700-.8 3.100-.8s1.900.8 3.200.7c1.300 0 2.200-1.200 3-2.400.9-1.400 1.300-2.700 1.300-2.800 0 0-2.500-1-2.500-3.900ZM14 5.400c.7-.8 1.100-1.900 1-3-1 0-2.100.7-2.800 1.500-.6.700-1.100 1.800-1 2.900 1.100.1 2.100-.6 2.800-1.400Z" />
      </svg>
    ),
  },
];

export default function SocialButtons({ verb = "Continue" }: { verb?: "Continue" | "Sign up" }) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {items.map((p) => (
          <a
            key={p.id}
            href={`/api/auth/oauth/${p.id}`}
            aria-label={`${verb} with ${p.label}`}
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[#d3dcd8] bg-white text-sm font-medium text-[#24342f] transition-colors hover:border-[#9db0a9] hover:bg-[#f4f7f6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0e3b31]"
          >
            {p.icon}
            <span className="hidden sm:inline">{p.label}</span>
          </a>
        ))}
      </div>
      <div className="my-6 flex items-center gap-3 text-xs text-[#7b8b86]" role="separator">
        <span className="h-px flex-1 bg-[#dfe6e3]" />
        or with your email
        <span className="h-px flex-1 bg-[#dfe6e3]" />
      </div>
    </div>
  );
}
