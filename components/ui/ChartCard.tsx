"use client";

import Card, { CardHeader } from "./Card";
import { formatNumber } from "@/lib/utils";

export interface ChartSeries {
  label: string;
  values: { key: string; value: number; color: string }[];
}

/** Lightweight bar chart drawn with CSS — no chart library needed. */
export default function ChartCard({
  title,
  description,
  data,
  legend,
  action,
}: {
  title: string;
  description?: string;
  data: ChartSeries[];
  legend: { key: string; label: string; color: string }[];
  action?: React.ReactNode;
}) {
  const max = Math.max(
    1,
    ...data.flatMap((group) => group.values.map((v) => v.value))
  );

  return (
    <Card>
      <CardHeader title={title} description={description} action={action} />
      <div className="px-5 py-4">
        <div className="flex items-end gap-3 overflow-x-auto pb-2" style={{ height: 200 }}>
          {data.map((group) => (
            <div key={group.label} className="flex min-w-[52px] flex-1 flex-col items-center gap-2">
              <div className="flex h-full w-full items-end justify-center gap-1">
                {group.values.map((bar) => (
                  <div
                    key={bar.key}
                    title={`${bar.key}: ${formatNumber(bar.value)}`}
                    className="w-3 rounded-t transition-[height] sm:w-4"
                    style={{
                      height: `${Math.max(4, (bar.value / max) * 100)}%`,
                      backgroundColor: bar.color,
                    }}
                  />
                ))}
              </div>
              <span className="text-xs text-slate-500">{group.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3">
          {legend.map((item) => (
            <span key={item.key} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
