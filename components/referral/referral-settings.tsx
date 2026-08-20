"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Copy, Gift, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReferral } from "@/lib/hooks/referral/use-referral";
import { REFERRAL_CREDITS } from "@/lib/billing/config";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const numberFormatter = new Intl.NumberFormat("en-IN");

const iosSurfaceClass =
  "bg-[color-mix(in_oklch,var(--foreground)_4.5%,var(--card))]";
const iosListClass = cn(
  "overflow-hidden rounded-[20px] divide-y divide-border/70",
  iosSurfaceClass,
);
const iosRowClass =
  "flex min-h-11 items-center justify-between gap-4 px-4 py-2.5";

const copyToClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
};

const shareReferralLink = async (shareUrl: string) => {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unsupported" as const;
  }

  try {
    await navigator.share({
      title: "Join me on Sakhi",
      text: `Sign up with my link and I earn ${numberFormatter.format(REFERRAL_CREDITS)} credits.`,
      url: shareUrl,
    });
    return "shared" as const;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "cancelled" as const;
    }
    return "failed" as const;
  }
};

export function ReferralSettings() {
  const referralQuery = useReferral();
  const referral = referralQuery.data;
  const [hasCopied, setHasCopied] = useState(false);

  const shareUrl = useMemo(() => {
    if (!referral?.code || typeof window === "undefined") return "";
    return `${window.location.origin}/r/${referral.code}`;
  }, [referral?.code]);

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return;
    const copied = await copyToClipboard(shareUrl);
    if (!copied) {
      toast.error("Copy failed. Please copy the link manually.");
      return;
    }
    setHasCopied(true);
    toast.success("Referral link copied");
    window.setTimeout(() => setHasCopied(false), 2000);
  }, [shareUrl]);

  const handleShareLink = useCallback(async () => {
    if (!shareUrl) return;
    const result = await shareReferralLink(shareUrl);
    if (result === "unsupported" || result === "failed") {
      await handleCopyLink();
    }
  }, [handleCopyLink, shareUrl]);

  if (referralQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-[20px] bg-muted" />
        <div className="h-40 animate-pulse rounded-[20px] bg-muted" />
      </div>
    );
  }

  if (!referral) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Referral details could not be loaded.
      </div>
    );
  }

  const creditsPerReferral = referral.creditsPerReferral || REFERRAL_CREDITS;

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
            Credits earned
          </p>
          <p className="text-[40px] font-semibold leading-tight tabular-nums text-primary">
            {numberFormatter.format(referral.creditsEarned)}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {numberFormatter.format(creditsPerReferral)} per signup
          </p>
        </section>
      </div>

      <div className="flex flex-col gap-4 lg:gap-6">
        <div className="space-y-1.5">
          <div className="px-1">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-xl font-semibold">Invite friends</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Share your link. When someone new signs up with it, you get{" "}
              {numberFormatter.format(creditsPerReferral)} credits.
            </p>
          </div>
        </div>

        <div className={iosListClass}>
          <div className={cn(iosRowClass, "flex-col items-stretch gap-3 py-4")}>
            <span className="text-[15px]">Your referral link</span>
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 flex-1 truncate rounded-full bg-background px-4 py-2 text-[13px] text-muted-foreground">
                {shareUrl}
              </p>
              <Button
                type="button"
                variant="secondary"
                className="h-9 shrink-0 rounded-full px-3"
                onClick={handleCopyLink}
                aria-label={hasCopied ? "Referral link copied" : "Copy referral link"}
              >
                {hasCopied ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {hasCopied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Button
              type="button"
              className="h-10 w-full rounded-full shadow-sm"
              onClick={handleShareLink}
              aria-label="Share referral link"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share link
            </Button>
          </div>
          <div className={iosRowClass}>
            <span className="text-[15px]">Successful referrals</span>
            <span className="text-right text-[15px] tabular-nums text-muted-foreground">
              {numberFormatter.format(referral.successfulReferrals)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
