"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type PaymentConfirmationKind = "plan" | "recharge";

export function PaymentConfirmationModal({
  kind,
  onDismiss,
}: {
  kind: PaymentConfirmationKind;
  onDismiss: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const isPlan = kind === "plan";
  const copy = isPlan
    ? {
        title: "Activating your plan",
        description:
          "We’re getting everything ready. This usually takes a few seconds.",
        readyMessage: "We’ll let you know as soon as your plan is ready.",
      }
    : {
        title: "Adding your credits",
        description:
          "We’re updating your balance. This usually takes a few seconds.",
        readyMessage: "Your new credits will appear automatically.",
      };

  return (
    <DialogContent
      showCloseButton={false}
      className="max-w-[350px] gap-0 overflow-hidden rounded-[28px] border-none p-0 text-center shadow-2xl sm:max-w-[380px]"
      style={{ width: "calc(100% - 2rem)", maxWidth: "380px" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-primary/[0.14] via-primary/[0.05] to-transparent"
      />

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex flex-col items-center px-7 pb-7 pt-9 sm:px-9 sm:pb-8"
      >
        <Loader2
          aria-hidden
          className="size-9 animate-spin text-primary motion-reduce:animate-none"
        />

        <DialogTitle className="mt-5 text-[24px] font-medium leading-tight tracking-tight">
          {copy.title}
        </DialogTitle>
        <DialogDescription className="mt-2 text-[14px] leading-relaxed text-foreground/70">
          {copy.description}
        </DialogDescription>

        <ul className="mt-6 w-full space-y-3 text-left">
          <li className="flex items-start gap-3 text-[13px] leading-relaxed text-foreground/75">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <strong className="font-medium text-foreground">
                No need to try again.
              </strong>{" "}
              We’re confirming your payment.
            </span>
          </li>
          <li className="flex items-start gap-3 text-[13px] leading-relaxed text-foreground/75">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{copy.readyMessage}</span>
          </li>
          <li className="flex items-start gap-3 text-[13px] leading-relaxed text-foreground/75">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              You can leave this page. We’ll keep working in the background.
            </span>
          </li>
        </ul>

        <Button
          className="mt-7 h-11 w-full rounded-full text-[15px] font-medium"
          onClick={onDismiss}
        >
          View billing
        </Button>
      </motion.div>
    </DialogContent>
  );
}
