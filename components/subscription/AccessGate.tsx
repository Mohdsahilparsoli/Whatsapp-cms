"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import PageHeader from "@/components/ui/PageHeader";
import { useAuth } from "@/lib/auth";
import { getPageMeta, isPaidFeaturePath } from "@/lib/nav";
import { statusFor, useSubscription } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";

/**
 * Blocks paid CMS areas for a Client Admin whose trial or plan has lapsed (or
 * has been suspended). Routes stay valid — the page simply explains what to do
 * next instead of rendering the feature.
 */
export default function AccessGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const { current, canUsePaidFeatures } = useSubscription();

  const blocked =
    user?.role === "client_admin" &&
    current !== null &&
    !canUsePaidFeatures &&
    isPaidFeaturePath(pathname);

  if (!blocked || !current) return <>{children}</>;

  const meta = getPageMeta(pathname);
  const suspended = statusFor(current) === "suspended";

  return (
    <div>
      <PageHeader title={meta.title} description={meta.description} />

      <InlineAlert
        tone="error"
        title={suspended ? "Subscription Suspended" : "Subscription Expired"}
        className="mb-5"
      >
        {suspended
          ? "This account has been suspended by Super Admin. Paid CMS features are unavailable until it is reactivated."
          : `Your ${current.isTrial ? "free trial" : "plan"} ended on ${formatDate(
              current.expiryDate
            )}. Choose a plan to restore access to this page.`}
      </InlineAlert>

      <Card>
        <EmptyState
          icon={Lock}
          title={`${meta.title} is locked`}
          description={
            suspended
              ? "Contact your Super Admin to reactivate this account."
              : "Your contacts, templates, and campaigns are safe. Pick a plan to unlock this page again."
          }
          action={
            !suspended && (
              <Link href="/subscriptions">
                <Button variant="primary">Choose a plan</Button>
              </Link>
            )
          }
        />
      </Card>
    </div>
  );
}
