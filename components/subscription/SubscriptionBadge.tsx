import StatusBadge from "@/components/ui/StatusBadge";
import { statusLabels, statusTone } from "@/lib/subscription";
import type { SubscriptionStatus } from "@/types";

/**
 * Renders "Free Trial" / "Active" / "Expiring Soon" / "Expired" / "Suspended"
 * using the existing StatusBadge colour tokens.
 */
export default function SubscriptionBadge({
  status,
}: {
  status: SubscriptionStatus;
}) {
  return <StatusBadge status={statusTone[status]} label={statusLabels[status]} />;
}
