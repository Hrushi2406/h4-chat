"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { MessageCircle, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WELCOME_CREDITS } from "@/lib/billing/config";

const numberFormatter = new Intl.NumberFormat("en-IN");

const colors = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa"];

const burstFromCorner = (originX: number, angle: number) => {
  confetti({
    particleCount: 90,
    angle,
    spread: 100,
    startVelocity: 65,
    decay: 0.9,
    gravity: 0.9,
    ticks: 250,
    origin: { x: originX, y: 1.05 },
    colors,
    scalar: 1.1,
  });
};

const fireConfetti = () => {
  burstFromCorner(0, 60);
  burstFromCorner(1, 120);
};

export default function DevPreviewWelcome() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(true);
    const timer = setTimeout(fireConfetti, 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="h-screen w-full bg-secondary flex items-center justify-center">
      <Button
        onClick={() => {
          setOpen(true);
          setTimeout(fireConfetti, 200);
        }}
      >
        Replay
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-[340px] gap-0 overflow-hidden rounded-[28px] border-none p-0 text-center shadow-2xl sm:max-w-[360px]"
        >
          <div className="flex flex-col items-center gap-5 px-8 pb-8 pt-10">
            <div className="relative flex size-16 items-center justify-center rounded-full bg-gradient-to-b from-primary/15 to-primary/5">
              <span className="text-[28px] leading-none">🥳</span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <DialogTitle className="text-[15px] font-medium text-muted-foreground">
                Welcome to Sakhi
              </DialogTitle>
              <p className="text-[56px] font-semibold leading-none tracking-tight tabular-nums">
                {numberFormatter.format(WELCOME_CREDITS)}
              </p>
              <DialogDescription className="text-[15px] font-medium text-foreground/80">
                free credits, on us
              </DialogDescription>
            </div>

            <div className="flex w-full flex-col divide-y divide-border/60 rounded-2xl bg-muted/50">
              <div className="flex items-center gap-3 px-4 py-3">
                <MessageCircle className="size-4 shrink-0 text-muted-foreground" />
                <p className="text-left text-[13px] font-medium text-foreground">
                  Hundreds of everyday chats
                </p>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <Zap className="size-4 shrink-0 text-muted-foreground" />
                <p className="text-left text-[13px] font-medium text-foreground">
                  Dozens of deeper tasks — images, research, automations
                </p>
              </div>
            </div>

            <Button
              className="h-11 w-full rounded-full text-[15px] font-medium"
              onClick={() => setOpen(false)}
            >
              Let&apos;s go
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
