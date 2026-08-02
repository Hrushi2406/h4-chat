"use client";

import { useEffect, useState } from "react";
import {
  motion,
  animate,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import confetti from "canvas-confetti";
import {
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  BILLING_PLANS,
  WELCOME_CREDITS,
  type BillingPlanId,
} from "@/lib/billing/config";

const confettiColors = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa"];

const burstFromCorner = (originX: number, angle: number) => {
  confetti({
    particleCount: 70,
    angle,
    spread: 90,
    startVelocity: 55,
    decay: 0.9,
    gravity: 0.9,
    ticks: 220,
    origin: { x: originX, y: 1.05 },
    colors: confettiColors,
    scalar: 1,
  });
};

const fireConfetti = () => {
  burstFromCorner(0, 60);
  burstFromCorner(1, 120);
};

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const COUNT_UP_DELAY_MS = 280;
const COUNT_UP_DURATION_MS = 1050;
const CONFETTI_DELAY_MS = 980;

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.12 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12, filter: "blur(3px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 320, damping: 30 },
  },
};

function useCountUp(target: number, active: boolean) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    const controls = animate(0, target, {
      duration: COUNT_UP_DURATION_MS / 1000,
      delay: COUNT_UP_DELAY_MS / 1000,
      ease: EASE_OUT_EXPO,
      onUpdate: (latest) => setValue(Math.round(latest)),
    });
    return () => controls.stop();
  }, [active, target]);

  return value;
}

export type CreditsCelebrationContent = {
  credits: number;
  title: string;
  planName?: "Free" | "Plus" | "Pro";
  creditLabel: string;
  description: string;
  buttonLabel?: string;
};

type CreditsCelebrationProps = CreditsCelebrationContent & {
  active: boolean;
  onDismiss: () => void;
};

export const WELCOME_CREDITS_CELEBRATION: CreditsCelebrationContent = {
  credits: WELCOME_CREDITS,
  title: "Welcome credits",
  planName: "Free",
  creditLabel: "free credits, on us",
  description:
    "Enough for up to 500 chats or up to 30 deep work sessions with research and automations.",
};

export const getPlanCreditsCelebration = (
  planId: Exclude<BillingPlanId, "free">,
): CreditsCelebrationContent => {
  const plan = BILLING_PLANS[planId];
  const planName = plan.name === "Pro" ? "Pro" : "Plus";

  return {
    credits: plan.monthlyCredits,
    title: `Welcome to Sakhi ${planName}`,
    planName,
    creditLabel:
      plan.interval === "annual"
        ? "credits, refreshed every month"
        : "credits every month",
    description:
      planName === "Pro"
        ? "We’re so glad you’re here. You now have more credits, more automations, and parallel work for your biggest ideas."
        : "We’re so glad you’re here. You now have more room for chats, research, and automations whenever you need it.",
    buttonLabel: "Let’s go",
  };
};

export const getRechargeCreditsCelebration = (
  credits: number,
): CreditsCelebrationContent => ({
  credits,
  title: "Your recharge is ready",
  creditLabel: "credits added",
  description: "Use them whenever you’re ready. They never expire.",
  buttonLabel: "Start using Sakhi",
});

export function CreditsCelebration({
  active,
  credits,
  title,
  planName,
  creditLabel,
  description,
  buttonLabel = "Let’s go",
  onDismiss,
}: CreditsCelebrationProps) {
  const shouldReduceMotion = useReducedMotion();
  const count = useCountUp(credits, active && !shouldReduceMotion);
  const displayedCredits = shouldReduceMotion && active ? credits : count;

  useEffect(() => {
    if (!active || shouldReduceMotion) return;
    const timer = setTimeout(fireConfetti, CONFETTI_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active, shouldReduceMotion]);

  if (planName) {
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
          variants={containerVariants}
          initial={shouldReduceMotion ? false : "hidden"}
          animate={active && !shouldReduceMotion ? "show" : undefined}
          className="relative flex flex-col items-center px-7 pb-7 pt-9 sm:px-9 sm:pb-8"
        >
          <motion.div variants={itemVariants}>
            <DialogTitle className="text-[25px] font-medium leading-tight tracking-tight">
              <span className="block text-[17px] font-medium tracking-normal text-foreground/75">
                Welcome to
              </span>
              <span className="mt-2 block font-sans text-[40px] font-medium not-italic leading-none text-primary">
                Sakhi {planName}
              </span>
            </DialogTitle>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="mt-8 flex w-full flex-col items-center gap-2"
          >
            <p className="text-[42px] font-medium leading-none tracking-tight tabular-nums">
              {displayedCredits.toLocaleString("en-IN")}
            </p>
            <p className="text-[13px] font-medium leading-snug text-foreground/65">
              {creditLabel}
            </p>
          </motion.div>

          <motion.div variants={itemVariants} className="mt-6">
            <DialogDescription className="text-[14px] leading-relaxed text-foreground/70">
              {description}
            </DialogDescription>
          </motion.div>

          <motion.div variants={itemVariants} className="mt-7 w-full">
            <Button
              asChild
              className="h-11 w-full rounded-full text-[15px] font-medium"
            >
              <motion.button
                onClick={onDismiss}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                {buttonLabel}
              </motion.button>
            </Button>
          </motion.div>
        </motion.div>
      </DialogContent>
    );
  }

  return (
    <DialogContent
      showCloseButton={false}
      className="max-w-[340px] gap-0 overflow-hidden rounded-[28px] border-none p-0 text-center shadow-2xl sm:max-w-[360px]"
      style={{ width: "calc(100% - 2rem)", maxWidth: "360px" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-primary/[0.14] via-primary/[0.05] to-transparent"
      />

      <motion.div
        variants={containerVariants}
        initial={shouldReduceMotion ? false : "hidden"}
        animate={active && !shouldReduceMotion ? "show" : undefined}
        className="relative flex flex-col items-center gap-5 px-8 pb-8 pt-10"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <div className="flex flex-col items-center gap-2">
          <motion.p
            variants={itemVariants}
            className="text-[56px] font-medium leading-none tracking-tight tabular-nums"
          >
            {displayedCredits.toLocaleString("en-IN")}
          </motion.p>
          <motion.div variants={itemVariants}>
            <DialogDescription className="text-[15px] font-medium text-foreground/80">
              {creditLabel}
            </DialogDescription>
          </motion.div>
        </div>

        <motion.p
          variants={itemVariants}
          className="text-[14px] leading-snug text-foreground/80"
        >
          {description}
        </motion.p>

        <motion.div variants={itemVariants} className="w-full">
          <Button
            asChild
            className="h-11 w-full rounded-full text-[15px] font-medium"
          >
            <motion.button
              onClick={onDismiss}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              {buttonLabel}
            </motion.button>
          </Button>
        </motion.div>
      </motion.div>
    </DialogContent>
  );
}

export function WelcomeCreditsCelebration({
  active,
  onDismiss,
}: {
  active: boolean;
  onDismiss: () => void;
}) {
  return (
    <CreditsCelebration
      active={active}
      {...WELCOME_CREDITS_CELEBRATION}
      onDismiss={onDismiss}
    />
  );
}
