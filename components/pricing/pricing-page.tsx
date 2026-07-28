"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/clients/firebase";
import {
  useBilling,
  useBillingActions,
} from "@/lib/hooks/billing/use-billing";
import {
  BILLING_PLANS,
  CREDIT_RECHARGE,
  getRechargeCredits,
  getRechargePricePaise,
  type BillingPlanId,
} from "@/lib/billing/config";

type BillingPeriod = "monthly" | "yearly";

type Plan = {
  monthlyPlanId: BillingPlanId;
  yearlyPlanId: BillingPlanId;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyTotal: number;
  credits: string;
  usage: string;
  features: string[];
  cta: string;
  badge?: string;
  featured?: boolean;
};

const plans: Plan[] = [
  {
    monthlyPlanId: "free",
    yearlyPlanId: "free",
    name: BILLING_PLANS.free.name,
    description: "Try Sakhi on real work",
    monthlyPrice: BILLING_PLANS.free.pricePaise / 100,
    yearlyPrice: BILLING_PLANS.free.pricePaise / 100,
    yearlyTotal: BILLING_PLANS.free.pricePaise / 100,
    credits: `${BILLING_PLANS.free.monthlyCredits.toLocaleString("en-IN")} welcome credits`,
    usage: "One-time · about 30 mixed tasks",
    features: [
      `Connect up to ${BILLING_PLANS.free.connectionLimit} apps`,
      `${BILLING_PLANS.free.automationLimit} active automation`,
      "Personal memory",
    ],
    cta: "Start free",
  },
  {
    monthlyPlanId: "plus_monthly",
    yearlyPlanId: "plus_annual",
    name: BILLING_PLANS.plus_monthly.name,
    description: "Make Sakhi part of every day",
    monthlyPrice: BILLING_PLANS.plus_monthly.pricePaise / 100,
    yearlyPrice: Math.round(
      BILLING_PLANS.plus_annual.pricePaise / 100 / 12,
    ),
    yearlyTotal: BILLING_PLANS.plus_annual.pricePaise / 100,
    credits: `${BILLING_PLANS.plus_monthly.monthlyCredits.toLocaleString("en-IN")} credits / month`,
    usage: "About 300 mixed tasks monthly",
    features: [
      BILLING_PLANS.plus_monthly.connectionLimit === null
        ? "Unlimited app connections"
        : `Connect up to ${BILLING_PLANS.plus_monthly.connectionLimit} apps`,
      `${BILLING_PLANS.plus_monthly.automationLimit} active automations`,
      "Personal memory",
      BILLING_PLANS.plus_monthly.allowedModels === "all"
        ? "Access to Pro models"
        : "Access to plan models",
    ],
    cta: "Choose Plus",
    badge: "Most popular",
    featured: true,
  },
  {
    monthlyPlanId: "pro_monthly",
    yearlyPlanId: "pro_annual",
    name: BILLING_PLANS.pro_monthly.name,
    description: "Run serious workflows at scale",
    monthlyPrice: BILLING_PLANS.pro_monthly.pricePaise / 100,
    yearlyPrice: Math.round(
      BILLING_PLANS.pro_annual.pricePaise / 100 / 12,
    ),
    yearlyTotal: BILLING_PLANS.pro_annual.pricePaise / 100,
    credits: `${BILLING_PLANS.pro_monthly.monthlyCredits.toLocaleString("en-IN")} credits / month`,
    usage: "About 1,500 mixed tasks monthly",
    features: [
      BILLING_PLANS.pro_monthly.connectionLimit === null
        ? "Unlimited app connections"
        : `Connect up to ${BILLING_PLANS.pro_monthly.connectionLimit} apps`,
      `${BILLING_PLANS.pro_monthly.automationLimit} active automations`,
      "Personal memory",
      BILLING_PLANS.pro_monthly.allowedModels === "all"
        ? "Access to Pro models"
        : "Access to plan models",
      BILLING_PLANS.pro_monthly.allowParallelTasks
        ? "Priority execution and parallel tasks"
        : "Priority execution",
    ],
    cta: "Choose Pro",
    badge: "5× credits",
  },
];

const priceFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const easeOut = [0.22, 1, 0.36, 1] as const;

const heroSequence = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.04,
      staggerChildren: 0.08,
    },
  },
} satisfies Variants;

const heroItem = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: easeOut },
  },
} satisfies Variants;

const cardSequence = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.24,
      staggerChildren: 0.095,
    },
  },
} satisfies Variants;

const cardItem = {
  hidden: { opacity: 0, y: 22, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.46, ease: easeOut },
  },
} satisfies Variants;

export function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [selectedPlanId, setSelectedPlanId] = useState<BillingPlanId>();
  const [rechargeUnits, setRechargeUnits] = useState<number>(
    CREDIT_RECHARGE.defaultUnits,
  );
  const router = useRouter();
  const billingQuery = useBilling();
  const { checkout, recharge, changePlan } = useBillingActions();
  const shouldReduceMotion = useReducedMotion();

  const choosePlan = async (planId: BillingPlanId) => {
    if (planId === "free") {
      router.push("/chat");
      return;
    }
    if (!auth.currentUser) {
      toast.error("Sign in before choosing a paid plan");
      router.push("/chat");
      return;
    }

    setSelectedPlanId(planId);
    try {
      const currentBilling =
        billingQuery.data ?? (await billingQuery.refetch()).data;
      const currentPlanId = currentBilling?.billing.planId;
      const currentStatus = currentBilling?.billing.subscriptionStatus;
      const hasCurrentPaidSubscription =
        currentPlanId &&
        currentPlanId !== "free" &&
        currentStatus !== "frozen" &&
        currentStatus !== "expired";
      if (hasCurrentPaidSubscription) {
        if (currentPlanId === planId) {
          toast.info("You are already on this plan.");
          router.push("/settings?tab=billing");
          return;
        }
        const change = await changePlan.mutateAsync(planId);
        if (!change.updated) {
          toast.info(
            change.message ?? "Razorpay is confirming your plan change.",
          );
        } else {
          toast.success(`${BILLING_PLANS[planId].name} is now active.`);
        }
        router.push("/settings?tab=billing");
        return;
      }

      const result = await checkout.mutateAsync(planId);
      if (result) {
        if (result.activationPending) {
          toast.info(
            "Payment received. Razorpay is confirming your subscription.",
          );
        } else {
          toast.success("Your plan is active and credits are ready.");
        }
        router.push("/settings?tab=billing");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Checkout could not start",
      );
    } finally {
      setSelectedPlanId(undefined);
    }
  };

  const buyRecharge = async () => {
    if (!auth.currentUser) {
      toast.error("Sign in before buying credits");
      router.push("/chat");
      return;
    }

    const credits = getRechargeCredits(rechargeUnits);
    try {
      const result = await recharge.mutateAsync(credits);
      if (!result) return;
      if (result.creditingPending) {
        toast.info(
          "Payment received. Razorpay is confirming your credits.",
        );
      } else {
        toast.success(
          `${credits.toLocaleString("en-IN")} credits added. They never expire.`,
        );
      }
      router.push("/settings?tab=billing");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Recharge could not start",
      );
    }
  };

  return (
    <div className="dark relative h-dvh overflow-y-auto overflow-x-hidden bg-[#0a0a0a] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_75%_55%_at_50%_18%,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(59,130,246,0.16),transparent_72%)]"
      />

      <MarketingNavbar />

      <main className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 pt-4 sm:px-8 sm:pb-24 sm:pt-6 lg:px-12">
        <motion.div
          className="mx-auto max-w-5xl text-center"
          variants={heroSequence}
          initial={shouldReduceMotion ? false : "hidden"}
          animate="visible"
        >
          <motion.h1
            className="font-serif text-3xl font-light leading-[1.1] tracking-tight text-blue-400 sm:text-4xl lg:text-5xl"
            variants={heroItem}
          >
            A plan for every way you work
          </motion.h1>
          <motion.p
            className="mx-auto mt-2 max-w-xl text-sm leading-6 text-neutral-400 sm:text-base"
            variants={heroItem}
          >
            Start free. Upgrade when you need more credits.
          </motion.p>

          <motion.div
            className="mt-10 inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] p-1 shadow-sm"
            role="group"
            aria-label="Billing period"
            variants={heroItem}
          >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                "rounded-full border-0 px-4 text-neutral-400 shadow-none transition-colors hover:bg-white/[0.06] hover:text-white",
                billingPeriod === "monthly" &&
                  "bg-white text-black shadow-sm hover:bg-white hover:text-black",
              )}
              aria-pressed={billingPeriod === "monthly"}
              onClick={() => setBillingPeriod("monthly")}
            >
              Monthly
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                "rounded-full border-0 px-4 text-neutral-400 shadow-none transition-colors hover:bg-white/[0.06] hover:text-white",
                billingPeriod === "yearly" &&
                  "bg-white text-black shadow-sm hover:bg-white hover:text-black",
              )}
              aria-pressed={billingPeriod === "yearly"}
              onClick={() => setBillingPeriod("yearly")}
            >
              Yearly · save 17%
            </Button>
          </motion.div>
        </motion.div>

        <motion.section
          className="mx-auto mt-12 grid max-w-6xl items-stretch gap-4 md:mt-20 md:grid-cols-3"
          aria-label="Sakhi pricing plans"
          variants={cardSequence}
          initial={shouldReduceMotion ? false : "hidden"}
          animate="visible"
        >
          {plans.map((plan) => (
            <motion.div key={plan.name} className="grid" variants={cardItem}>
              <PricingCard
                plan={plan}
                billingPeriod={billingPeriod}
                selectedPlanId={selectedPlanId}
                checkoutDisabled={recharge.isPending}
                onChoosePlan={choosePlan}
              />
            </motion.div>
          ))}
        </motion.section>

        <motion.p
          className="mx-auto mt-5 max-w-4xl text-center text-xs leading-5 text-muted-foreground"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.32, ease: easeOut }}
        >
          Plan credits refresh at the start of every calendar month, including
          annual plans, and do not roll over. One-time recharge credits never
          expire. Paused automations do not count toward limits; every
          automation run uses credits.
        </motion.p>

        <motion.section
          id="recharge"
          className="mx-auto mt-8 max-w-6xl scroll-mt-24 rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8"
          aria-labelledby="recharge-title"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.58, duration: 0.38, ease: easeOut }}
        >
          <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:justify-between lg:text-left">
            <div className="grid gap-1">
              <h2 id="recharge-title" className="text-lg font-semibold">
                One-time credit recharge
              </h2>
              <p className="text-sm text-muted-foreground">
                Extra credits that never expire.
              </p>
            </div>

            <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
              <div
                className="flex items-center gap-4"
                aria-label="Recharge credit quantity"
              >
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="rounded-full"
                  aria-label={`Remove ${CREDIT_RECHARGE.creditsPerUnit.toLocaleString("en-IN")} credits`}
                  disabled={
                    recharge.isPending ||
                    rechargeUnits <= CREDIT_RECHARGE.minimumUnits
                  }
                  onClick={() =>
                    setRechargeUnits((value) =>
                      Math.max(CREDIT_RECHARGE.minimumUnits, value - 1),
                    )
                  }
                >
                  <Minus className="size-4" />
                </Button>
                <div className="min-w-28 text-center" aria-live="polite">
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">
                    {getRechargeCredits(rechargeUnits).toLocaleString(
                      "en-IN",
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">credits</p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="rounded-full"
                  aria-label={`Add ${CREDIT_RECHARGE.creditsPerUnit.toLocaleString("en-IN")} credits`}
                  disabled={
                    recharge.isPending ||
                    rechargeUnits >= CREDIT_RECHARGE.maximumUnits
                  }
                  onClick={() =>
                    setRechargeUnits((value) =>
                      Math.min(CREDIT_RECHARGE.maximumUnits, value + 1),
                    )
                  }
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              <Button
                type="button"
                className="rounded-full px-6"
                disabled={Boolean(selectedPlanId) || recharge.isPending}
                onClick={() => void buyRecharge()}
              >
                {recharge.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Buy for ₹
                {priceFormatter.format(
                  getRechargePricePaise(getRechargeCredits(rechargeUnits)) /
                    100,
                )}
              </Button>
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}

function PricingCard({
  plan,
  billingPeriod,
  selectedPlanId,
  checkoutDisabled,
  onChoosePlan,
}: {
  plan: Plan;
  billingPeriod: BillingPeriod;
  selectedPlanId?: BillingPlanId;
  checkoutDisabled: boolean;
  onChoosePlan(planId: BillingPlanId): Promise<void>;
}) {
  const price =
    billingPeriod === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
  const isFree = plan.monthlyPrice === 0;
  const planId =
    billingPeriod === "monthly" ? plan.monthlyPlanId : plan.yearlyPlanId;
  const isLoading = selectedPlanId === planId;

  return (
    <div
      className={cn(
        "group relative h-full rounded-xl p-px",
        plan.featured && "z-10 md:-mt-6 md:h-[calc(100%+1.5rem)]",
      )}
    >
      <div
        aria-hidden
        className="card-ring-animate pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <article
        className="relative flex h-full min-w-0 flex-col gap-[18px] rounded-[calc(0.75rem-1px)] border bg-card p-6 text-card-foreground shadow-sm"
        aria-label={
          plan.featured ? `${plan.name}, most popular plan` : undefined
        }
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[calc(0.75rem-1px)] bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.12),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
        {plan.name === "Plus" ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[calc(0.75rem-1px)] bg-[radial-gradient(circle_at_100%_100%,rgba(59,130,246,0.18),transparent_70%)]"
          />
        ) : null}
        <div className="grid gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{plan.name}</h2>
            {plan.badge ? (
              <span className="rounded-full bg-[var(--tool-call-bg)] px-2 py-1 text-xs font-medium text-[var(--tool-call-text)]">
                {plan.badge}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        </div>

        <div className="grid gap-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight">
              ₹{priceFormatter.format(price)}
            </span>
            <span className="text-sm text-muted-foreground">
              {isFree ? "forever" : "/ month"}
            </span>
          </div>
          <p className="min-h-5 text-xs text-muted-foreground">
            {isFree
              ? "No credit card required"
              : billingPeriod === "yearly"
                ? `₹${priceFormatter.format(plan.yearlyTotal)} billed yearly`
                : "Billed monthly"}
          </p>
        </div>

        <div className="grid gap-1">
          <p className="font-medium">{plan.credits}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {plan.usage}
          </p>
        </div>

        <ul className="grid gap-2.5">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-1">
          <Button
            type="button"
            variant={plan.featured ? "default" : "outline"}
            className="w-full rounded-full"
            disabled={Boolean(selectedPlanId) || checkoutDisabled}
            onClick={() => void onChoosePlan(planId)}
          >
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            {plan.cta}
          </Button>
        </div>
      </article>
    </div>
  );
}
