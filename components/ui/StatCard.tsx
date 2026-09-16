import { cn } from "@/lib/utils";
import Card from "./Card";

export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "positive" | "warning" | "negative";
}) {
  const tones = {
    default: "bg-indigo-50 text-indigo-600",
    positive: "bg-emerald-50 text-emerald-600",
    warning: "bg-amber-50 text-amber-600",
    negative: "bg-red-50 text-red-600",
  } as const;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn("rounded-lg p-2", tones[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
    </Card>
  );
}
