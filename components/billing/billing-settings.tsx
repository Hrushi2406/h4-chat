"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { useBilling, useBillingActions } from "@/lib/hooks/billing/use-billing";
import { BILLING_PLANS } from "@/lib/billing/config";
import { PricingLink } from "@/components/billing/pricing-link";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const numberFormatter = new Intl.NumberFormat("en-IN");
const priceFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const formatDate = (value: string | null) =>
  value ? dateFormatter.format(new Date(value)) : "—";

const iosSurfaceClass =
  "bg-[color-mix(in_oklch,var(--foreground)_4.5%,var(--card))]";
const iosListClass = cn(
  "overflow-hidden rounded-[20px] divide-y divide-border/70",
  iosSurfaceClass,
);
const iosRowClass =
  "flex min-h-11 items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-foreground/[0.03]";

function Row({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className={iosRowClass}>
      <span className="text-[15px]">{label}</span>
      <span
        className={cn(
          "text-right text-[15px] text-muted-foreground",
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function BillingSettings() {
  const billingQuery = useBilling();
  const { cancel } = useBillingActions();
  const summary = billingQuery.data?.billing;
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);

  if (billingQuery.isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Billing information could not be loaded.
      </div>
    );
  }

  const plan = BILLING_PLANS[summary.planId];
  const available = summary.totalCreditsAvailable;
  const isFree = summary.planId === "free";

  const cancelPlan = () => {
    cancel.mutate(undefined, {
      onSuccess: () => {
        setIsCancelConfirmOpen(false);
        toast.success("Your plan will end after the current paid period.");
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Could not cancel the plan",
        );
      },
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-stretch lg:gap-6">
      <div className="flex flex-col gap-4 lg:gap-3">
        <section
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-[20px] p-6 text-center",
            iosSurfaceClass,
          )}
        >
          <p className="text-[13px] font-medium text-muted-foreground">
            Available credits
          </p>
          <p className="text-[40px] font-semibold leading-tight tabular-nums text-primary">
            {numberFormatter.format(available)}
          </p>
        </section>

        <div className="flex flex-col gap-3">
          <Button
            asChild
            variant="secondary"
            className="h-10 w-full rounded-full border"
          >
            <PricingLink section="recharge">Buy more credits</PricingLink>
          </Button>
          <Button asChild className="h-10 w-full rounded-full shadow-sm">
            <PricingLink>
              {isFree ? "Choose a plan" : "Change plan"}
            </PricingLink>
          </Button>
        </div>

        {summary.rechargeCreditDebt > 0 && (
          <p className="px-1 text-[13px] text-destructive">
            {numberFormatter.format(summary.rechargeCreditDebt)} recharge
            credits will be deducted from your next purchase.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:gap-6">
        <div className="space-y-1.5">
          <div className={iosListClass}>
            <Row
              label="Plan"
              value={
                summary.interval === "none"
                  ? summary.planName
                  : `${summary.planName} · ${summary.interval === "annual" ? "Annual" : "Monthly"}`
              }
            />
            <Row
              label="Price"
              value={
                isFree
                  ? "Free"
                  : `₹${priceFormatter.format(
                      (summary.interval === "annual"
                        ? plan.pricePaise / 12
                        : plan.pricePaise) / 100,
                    )} / month`
              }
            />
            <Row
              label="Status"
              value={(isFree
                ? "free"
                : summary.subscriptionStatus
              ).replaceAll("_", " ")}
              valueClassName="capitalize"
            />
            <Row
              label="Credits"
              value={
                isFree
                  ? `${numberFormatter.format(plan.monthlyCredits)} one time`
                  : `${numberFormatter.format(plan.monthlyCredits)} / month`
              }
            />
            <Row
              label="Plan renews on"
              value={formatDate(summary.paidThrough)}
            />
            <Row
              label="Credits reset on"
              value={formatDate(summary.nextRefreshAt)}
            />
          </div>
        </div>

        {!isFree && (
          <div className="space-y-1.5">
            <div className={iosListClass}>
              <div className={cn(iosRowClass, "items-center")}>
                <div className="min-w-0">
                  <p className="text-[15px]">
                    {summary.cancelAtPeriodEnd
                      ? "Subscription ending"
                      : "Cancel subscription"}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {summary.cancelAtPeriodEnd
                      ? `You'll continue to have access until ${formatDate(summary.paidThrough)}.`
                      : "You'll continue to have access until your billing period ends."}
                  </p>
                </div>
                {!summary.cancelAtPeriodEnd && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 shrink-0 self-center px-3 text-[13px] font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={cancel.isPending}
                    onClick={() => setIsCancelConfirmOpen(true)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={isCancelConfirmOpen}
        title="Cancel subscription?"
        description={`You'll continue to have access to ${summary.planName} and your credits until ${formatDate(summary.paidThrough)}. After that, you'll be moved to the free plan.`}
        confirmLabel="Cancel subscription"
        confirmingLabel="Cancelling..."
        cancelLabel="Keep subscription"
        isConfirming={cancel.isPending}
        onCancel={() => setIsCancelConfirmOpen(false)}
        onConfirm={cancelPlan}
      />
    </div>
  );
}
