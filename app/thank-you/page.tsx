"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/waitlist/confetti";
import { WaitlistHeroBackground } from "@/components/waitlist/waitlist-hero-background";
import {
  clearWaitlistJoined,
  hasJoinedWaitlist,
} from "@/lib/waitlist-session";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Check, Share } from "lucide-react";
import { toast } from "sonner";

const SHARE_TEXT =
  "Join the waitlist for Sakhi — an AI assistant that actually does the work.";

const ease = [0.22, 1, 0.36, 1] as const;

const contentVariants: Variants = {
  hidden: { opacity: 0, y: 28, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.75, delay: 0.15, ease },
  },
};

export default function ThankYouPage() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!hasJoinedWaitlist()) router.replace("/");
  }, [router]);

  const handleBackHome = () => {
    clearWaitlistJoined();
    router.push("/");
  };

  const handleShare = async () => {
    const url = window.location.origin;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Sakhi AI", text: SHARE_TEXT, url });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT}\n${url}`);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not share. Copy the link from your browser.");
    }
  };

  return (
    <div className="relative h-dvh overflow-hidden bg-[#0a0a0a] text-white">
      <Confetti />

      <motion.nav
        className="relative z-20 flex w-full items-center justify-between px-6 py-5 md:px-12"
        initial={shouldReduceMotion ? false : { opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
      >
        <span className="text-lg font-semibold tracking-tight">Sakhi AI</span>
        <Button
          variant="outline"
          className="rounded-full border-white/15 bg-white/5 text-white shadow-[0_0_24px_-12px_rgba(59,130,246,0.55)] backdrop-blur-md transition-all duration-300 hover:border-blue-400/40 hover:bg-white/10 hover:text-white hover:shadow-[0_0_28px_-8px_rgba(59,130,246,0.65)]"
          onClick={handleBackHome}
        >
          Back to home
        </Button>
      </motion.nav>

      <main className="absolute inset-0 z-10 flex items-center justify-center px-4">
        <motion.div
          className="flex w-full max-w-3xl flex-col items-center text-center"
          variants={contentVariants}
          initial={shouldReduceMotion ? false : "hidden"}
          animate="visible"
        >
          <motion.div
            className="mb-8 flex size-20 items-center justify-center rounded-full bg-blue-500/20 ring-2 ring-blue-400/40 shadow-[0_0_48px_-8px_rgba(59,130,246,0.8)]"
            initial={shouldReduceMotion ? false : { scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 16,
              delay: 0.35,
            }}
          >
            <Check className="size-10 text-blue-400" strokeWidth={2.5} />
          </motion.div>

          <h1 className="font-serif text-4xl font-light leading-tight tracking-tight md:text-5xl lg:text-6xl">
            You&apos;re on the list!
          </h1>
          <p className="mt-6 max-w-md text-neutral-400">
            Thanks for joining. We&apos;ll email you when Sakhi is ready for
            early access.
          </p>

          <div className="mt-10 w-full max-w-lg rounded-2xl border border-blue-400/20 bg-white/[0.04] p-6 shadow-[0_0_0_1px_rgba(147,197,253,0.15)_inset,0_20px_60px_-24px_rgba(59,130,246,0.5)] backdrop-blur-xl">
            <p className="text-sm text-neutral-300">
              Share Sakhi with friends who&apos;d love an AI that actually gets
              things done.
            </p>
            <Button
              type="button"
              onClick={handleShare}
              aria-label="Share with friend"
              className="mt-5 h-11 gap-2 rounded-full border-0 bg-white px-6 text-sm font-medium text-black shadow-[0_0_24px_-6px_rgba(255,255,255,0.5)] transition-all duration-300 hover:scale-[1.02] hover:bg-blue-50 hover:shadow-[0_0_32px_-4px_rgba(59,130,246,0.75)] active:scale-[0.98]"
            >
              <Share className="size-4 shrink-0" aria-hidden />
              Share with Friend
            </Button>
          </div>
        </motion.div>
      </main>

      <WaitlistHeroBackground />
    </div>
  );
}
