"use client";

import { useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { BILLING_PLANS } from "@/lib/billing/config";
import { useBilling } from "@/lib/hooks/billing/use-billing";
import { cn } from "@/lib/utils";
import { PricingLink } from "@/components/billing/pricing-link";

type CreditLevel = "healthy" | "low" | "critical";

const levelStyles: Record<
  CreditLevel,
  { text: string; track: string; fill: string; message: string }
> = {
  healthy: {
    text: "text-primary",
    track: "text-primary opacity-20",
    fill: "text-primary",
    message: "Credits available",
  },
  low: {
    text: "text-amber-600 dark:text-amber-400",
    track: "text-amber-500/20",
    fill: "text-amber-500",
    message: "Credits are running low",
  },
  critical: {
    text: "text-red-600 dark:text-red-400",
    track: "text-red-500/20",
    fill: "text-red-500",
    message: "Credits are almost gone",
  },
};

const numberFormatter = new Intl.NumberFormat("en-IN");
const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const getCreditLevel = (remainingPercent: number): CreditLevel => {
  if (remainingPercent <= 5) return "critical";
  if (remainingPercent <= 20) return "low";
  return "healthy";
};

const formatRefreshDate = (value: string | null) =>
  value ? dateFormatter.format(new Date(value)) : null;

export function CreditMeter() {
  const billingQuery = useBilling();
  const summary = billingQuery.data?.billing;
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const showMeter = () => {
    cancelClose();
    setOpen(true);
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  };

  if (!summary) return null;

  const allowance = BILLING_PLANS[summary.planId].monthlyCredits;
  const available = summary.totalCreditsAvailable;
  const rawPercent = allowance > 0 ? (available / allowance) * 100 : 0;
  const displayPercent = Math.min(100, Math.max(0, rawPercent));
  const level = getCreditLevel(rawPercent);
  const styles = levelStyles[level];
  const refreshDate = formatRefreshDate(summary.nextRefreshAt);
  const circumference = 2 * Math.PI * 8;
  const dashOffset = circumference * (1 - displayPercent / 100);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          className={cn(
            "group flex h-8 items-center justify-center rounded-full border bg-secondary px-2 shadow-none outline-none transition-colors hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            styles.text,
          )}
          aria-label={`${numberFormatter.format(available)} credits remaining. ${styles.message}.`}
          aria-expanded={open}
          aria-haspopup="dialog"
          onMouseEnter={showMeter}
          onMouseLeave={scheduleClose}
          onFocus={showMeter}
          onBlur={scheduleClose}
        >
          <svg
            viewBox="0 0 20 20"
            className="-rotate-90 size-5 shrink-0"
            aria-hidden="true"
          >
            <circle
              cx="10"
              cy="10"
              r="8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              className={styles.track}
            />
            <circle
              cx="10"
              cy="10"
              r="8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className={cn(
                "transition-[stroke-dashoffset] duration-500",
                styles.fill,
              )}
            />
          </svg>
        </button>
      </PopoverAnchor>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[min(19rem,calc(100vw-1rem))] rounded-xl p-4 shadow-lg"
        onMouseEnter={showMeter}
        onMouseLeave={scheduleClose}
        onFocusCapture={showMeter}
        onBlurCapture={scheduleClose}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {summary.interval === "none" ? "Credits" : "Monthly credits"}
            </p>
            <p
              className={cn(
                "mt-0.5 flex items-center gap-1 text-[11px] font-medium",
                styles.text,
              )}
            >
              {level !== "healthy" && <CircleAlert className="size-3" />}
              {styles.message}
            </p>
          </div>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
            {summary.planName}
          </span>
        </div>

        <p className="mt-3 flex flex-wrap items-baseline gap-x-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {numberFormatter.format(available)}
          </span>
          <span className="text-xs text-muted-foreground">
            / {numberFormatter.format(allowance)} remaining
          </span>
        </p>

        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Credits remaining"
          aria-valuemin={0}
          aria-valuemax={allowance}
          aria-valuenow={Math.min(available, allowance)}
        >
          <div
            className={cn(
              "h-full origin-left rounded-full transition-transform duration-500",
              level === "healthy" && "bg-primary",
              level === "low" && "bg-amber-500",
              level === "critical" && "bg-red-500",
            )}
            style={{ transform: `scaleX(${displayPercent / 100})` }}
          />
        </div>

        <Button asChild size="sm" className="mt-4 h-8 w-full rounded-full">
          <PricingLink>
            {summary.planId === "free" ? "View plans" : "Buy more"}
          </PricingLink>
        </Button>

        {refreshDate && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Credits reset on {refreshDate}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
