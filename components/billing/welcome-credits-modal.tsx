"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { consumeWelcomeCreditsPending } from "@/lib/billing/welcome-credits-flag";
import { WelcomeCreditsCelebration } from "@/components/billing/welcome-credits-celebration";

export function WelcomeCreditsModal() {
  const { uid } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!uid) return;
    if (!consumeWelcomeCreditsPending(uid)) return;

    setOpen(true);
  }, [uid]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <WelcomeCreditsCelebration active={open} onDismiss={() => setOpen(false)} />
    </Dialog>
  );
}
