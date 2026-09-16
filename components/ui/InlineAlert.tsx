import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "error" | "info";

const tones: Record<Tone, { className: string; icon: React.ComponentType<{ className?: string }> }> = {
  success: {
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: CheckCircle2,
  },
  warning: {
    className: "border-amber-200 bg-amber-50 text-amber-900",
    icon: AlertTriangle,
  },
  error: {
    className: "border-red-200 bg-red-50 text-red-800",
    icon: XCircle,
  },
  info: {
    className: "border-slate-200 bg-slate-50 text-slate-700",
    icon: Info,
  },
};

export default function InlineAlert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { className: toneClass, icon: Icon } = tones[tone];
  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : undefined}
      className={cn(
        "flex flex-wrap items-start gap-2.5 rounded-lg border px-4 py-3 text-sm",
        toneClass,
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && (
          <div className={cn("text-sm leading-relaxed", title && "mt-0.5")}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
