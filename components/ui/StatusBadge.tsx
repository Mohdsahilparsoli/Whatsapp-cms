import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  delivered: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  opted_in: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  running: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  read: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  processing: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  scheduled: "bg-sky-50 text-sky-700 ring-sky-600/20",
  custom: "bg-violet-50 text-violet-700 ring-violet-600/20",
  trial: "bg-sky-50 text-sky-700 ring-sky-600/20",
  sent: "bg-sky-50 text-sky-700 ring-sky-600/20",
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  expiring: "bg-amber-50 text-amber-700 ring-amber-600/20",
  paused: "bg-amber-50 text-amber-700 ring-amber-600/20",
  queued: "bg-slate-100 text-slate-600 ring-slate-500/20",
  draft: "bg-slate-100 text-slate-600 ring-slate-500/20",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-500/20",
  failed: "bg-red-50 text-red-700 ring-red-600/20",
  expired: "bg-red-50 text-red-700 ring-red-600/20",
  rejected: "bg-red-50 text-red-700 ring-red-600/20",
  overdue: "bg-red-50 text-red-700 ring-red-600/20",
  opted_out: "bg-red-50 text-red-700 ring-red-600/20",
  suspended: "bg-orange-50 text-orange-700 ring-orange-600/20",
};

export default function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
        map[status] ?? "bg-slate-100 text-slate-600 ring-slate-500/20"
      )}
    >
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}
