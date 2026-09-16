import Card, { CardHeader } from "@/components/ui/Card";
import { planComparison, plans } from "@/data/plans";
import { formatCurrency } from "@/lib/utils";
import type { PlanId } from "@/types";

export default function PlanComparison({
  currentPlanId,
}: {
  currentPlanId?: PlanId | null;
}) {
  return (
    <Card>
      <CardHeader
        title="Plan comparison"
        description="Indicative capabilities per plan — Super Admin can configure the real limits later."
      />
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-slate-600">
                Capability
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.id}
                  scope="col"
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600"
                >
                  {plan.name}
                  <span className="ml-1.5 font-normal text-slate-400">
                    {formatCurrency(plan.price)}/yr
                  </span>
                  {currentPlanId === plan.id && (
                    <span className="ml-1.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
                      Current
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {planComparison.map((row) => (
              <tr key={row.capability} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-700">{row.capability}</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="px-4 py-3 text-slate-600">
                    {row.values[plan.id]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
