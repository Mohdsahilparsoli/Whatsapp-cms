import { cn } from "@/lib/utils";
import type { TemplateSource } from "@/types";

/**
 * Keeps the two libraries visually distinct. A custom template is never
 * labelled "Meta Approved" — there is no approval data behind it.
 */
export default function TemplateSourceBadge({
  source,
  className,
}: {
  source: TemplateSource;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        source === "meta"
          ? "bg-sky-50 text-sky-700 ring-sky-600/20"
          : "bg-violet-50 text-violet-700 ring-violet-600/20",
        className
      )}
    >
      {source === "meta" ? "Meta-Approved" : "Custom"}
    </span>
  );
}
