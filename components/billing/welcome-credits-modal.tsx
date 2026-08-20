"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { consumeWelcomeCreditsPending } from "@/lib/billing/welcome-credits-flag";
import { WelcomeCreditsCelebration } from "@/components/billing/welcome-credits-celebration";
import { useUser } from "@/lib/hooks/user/use-user";
import billingService from "@/lib/services/billing-service";
import { auth } from "@/lib/clients/firebase";

export function WelcomeCreditsModal() {
  const { uid } = useAuth();
  const userQuery = useUser();
  const [open, setOpen] = useState(false);
  const processedUidRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!uid || !userQuery.isFetched || !userQuery.data) return;
    if (processedUidRef.current === uid) return;

    processedUidRef.current = uid;
    const isNewSignup = consumeWelcomeCreditsPending(uid);
    const isLegacyUser = userQuery.data.billing === undefined;
    if (!isNewSignup && !isLegacyUser) return;

    // The client already uses the same welcome-credit default for a missing
    // billing profile, so show the celebration immediately. Provisioning and
    // refreshing the server-owned profile must not delay the animation.
    if (auth.currentUser?.uid === uid) setOpen(true);

    if (!isLegacyUser) return;

    const provisionWelcomeCredits = async () => {
      try {
        await billingService.getCurrentBilling();
        await userQuery.refetch();
      } catch (error) {
        // Let a reload retry provisioning if the background request failed.
        if (processedUidRef.current === uid) {
          processedUidRef.current = undefined;
        }
        console.error("Unable to grant welcome credits:", error);
      }
    };

    void provisionWelcomeCredits();
  }, [uid, userQuery.data, userQuery.isFetched, userQuery.refetch]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <WelcomeCreditsCelebration active={open} onDismiss={() => setOpen(false)} />
    </Dialog>
  );
}
