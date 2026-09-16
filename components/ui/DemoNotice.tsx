import { Info } from "lucide-react";

export default function DemoNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
