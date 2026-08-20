"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { isValidReferralCode } from "@/lib/referral/code";
import { persistPendingReferralCode } from "@/lib/referral/pending";

export default function ReferralLandingPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  useEffect(() => {
    if (typeof code === "string" && isValidReferralCode(code)) {
      persistPendingReferralCode(code);
    }
    router.replace("/chat");
  }, [code, router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-center">
      <p className="text-sm text-muted-foreground">Opening Sakhi…</p>
    </main>
  );
}
