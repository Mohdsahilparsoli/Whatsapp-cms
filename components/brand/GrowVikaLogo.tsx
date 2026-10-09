import { cn } from "@/lib/utils";

/** The GrowVika wordmark: extra-wide heavy sans with the blue square stop.
 * `tone` is the surface it sits on ("dark" = white wordmark). `mark` shows
 * only "G" + the square, for collapsed sidebars and small spaces. */
export default function GrowVikaLogo({
  tone = "light",
  mark = false,
  className,
}: {
  tone?: "light" | "dark";
  mark?: boolean;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="GrowVika"
      className={cn(
        "inline-flex items-baseline font-[family-name:var(--font-brand)] font-extrabold leading-none tracking-[-0.045em]",
        tone === "dark" ? "text-white" : "text-[#050a1a]",
        className
      )}
      style={{ fontVariationSettings: '"wdth" 125' }}
    >
      {mark ? "G" : "GrowVika"}
      <span aria-hidden className="ml-[0.08em] inline-block h-[0.2em] w-[0.2em] bg-[#3f5bff]" />
    </span>
  );
}
