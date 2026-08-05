"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CreditsCelebration,
  WELCOME_CREDITS_CELEBRATION,
  getPlanCreditsCelebration,
  getRechargeCreditsCelebration,
  type CreditsCelebrationContent,
} from "@/components/billing/welcome-credits-celebration";
import { BILLING_PLANS } from "@/lib/billing/config";
import {
  PaymentConfirmationModal,
  type PaymentConfirmationKind,
} from "@/components/billing/payment-confirmation-modal";

type Preview = CreditsCelebrationContent & {
  id: string;
  label: string;
  detail: string;
};

const planPrice = (
  planId:
    | "plus_monthly"
    | "plus_annual"
    | "pro_monthly"
    | "pro_annual",
) => {
  const plan = BILLING_PLANS[planId];
  const price = (plan.pricePaise / 100).toLocaleString("en-IN");
  return `₹${price} / ${plan.interval === "annual" ? "year" : "month"}`;
};

const previews: Preview[] = [
  {
    id: "welcome",
    label: "Welcome",
    detail: "New signup",
    ...WELCOME_CREDITS_CELEBRATION,
  },
  {
    id: "plus-monthly",
    label: "Plus monthly",
    detail: planPrice("plus_monthly"),
    ...getPlanCreditsCelebration("plus_monthly"),
  },
  {
    id: "plus-annual",
    label: "Plus annual",
    detail: planPrice("plus_annual"),
    ...getPlanCreditsCelebration("plus_annual"),
  },
  {
    id: "pro-monthly",
    label: "Pro monthly",
    detail: planPrice("pro_monthly"),
    ...getPlanCreditsCelebration("pro_monthly"),
  },
  {
    id: "pro-annual",
    label: "Pro annual",
    detail: planPrice("pro_annual"),
    ...getPlanCreditsCelebration("pro_annual"),
  },
  {
    id: "recharge",
    label: "Credit recharge",
    detail: "5,000 one-time credits",
    ...getRechargeCreditsCelebration(5_000),
  },
];

export default function DevPreviewWelcome() {
  const [open, setOpen] = useState(true);
  const [selectedId, setSelectedId] = useState(previews[0].id);
  const [confirmationKind, setConfirmationKind] =
    useState<PaymentConfirmationKind>();
  const selected = previews.find((preview) => preview.id === selectedId)!;

  const showPreview = (id: string) => {
    setOpen(false);
    setConfirmationKind(undefined);
    setSelectedId(id);
    window.setTimeout(() => setOpen(true), 50);
  };

  const showConfirmation = (kind: PaymentConfirmationKind) => {
    setOpen(false);
    setConfirmationKind(kind);
    window.setTimeout(() => setOpen(true), 50);
  };

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-secondary px-5 py-10">
      <section className="w-full max-w-2xl">
        <div className="mb-8 max-w-lg">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Dev preview
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Credit celebrations
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Choose a purchase state to review its final copy, credit amount,
            count-up, and confetti.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {previews.map((preview) => (
            <button
              key={preview.id}
              type="button"
              className="flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => showPreview(preview.id)}
            >
              <span className="text-sm font-medium">{preview.label}</span>
              <span className="text-xs text-muted-foreground">
                {preview.detail}
              </span>
            </button>
          ))}
          <button
            type="button"
            className="flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => showConfirmation("plan")}
          >
            <span className="text-sm font-medium">Plan confirmation</span>
            <span className="text-xs text-muted-foreground">
              Razorpay pending
            </span>
          </button>
          <button
            type="button"
            className="flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => showConfirmation("recharge")}
          >
            <span className="text-sm font-medium">Recharge confirmation</span>
            <span className="text-xs text-muted-foreground">
              Razorpay pending
            </span>
          </button>
        </div>

        <Button
          className="mt-5 rounded-full"
          onClick={() =>
            confirmationKind
              ? showConfirmation(confirmationKind)
              : showPreview(selectedId)
          }
        >
          Replay{" "}
          {confirmationKind
            ? `${confirmationKind} confirmation`
            : selected.label}
        </Button>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        {confirmationKind ? (
          <PaymentConfirmationModal
            kind={confirmationKind}
            onDismiss={() => setOpen(false)}
          />
        ) : (
          <CreditsCelebration
            key={selected.id}
            active={open}
            credits={selected.credits}
            title={selected.title}
            planName={selected.planName}
            creditLabel={selected.creditLabel}
            description={selected.description}
            buttonLabel={selected.buttonLabel}
            onDismiss={() => setOpen(false)}
          />
        )}
      </Dialog>
    </main>
  );
}
