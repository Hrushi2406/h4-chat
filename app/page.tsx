"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WaitlistFooter } from "@/components/waitlist/waitlist-footer";
import { UseCasesSection } from "@/components/waitlist/use-cases-section";
import { WaitlistHeroBackground } from "@/components/waitlist/waitlist-hero-background";
import { TrustedBySection } from "@/components/waitlist/trusted-by-section";
import { useWaitlistActions } from "@/lib/hooks/waitlist/use-waitlist-actions";
import { markWaitlistJoined } from "@/lib/waitlist-session";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Loader2, Mail } from "lucide-react";

const ease = [0.22, 1, 0.36, 1] as const;

const heroVariants: Variants = {
  hidden: { opacity: 0, y: 28, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.75, delay: 0.15, ease },
  },
};

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const router = useRouter();
  const { joinWaitlist } = useWaitlistActions();
  const shouldReduceMotion = useReducedMotion();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || joinWaitlist.isPending) return;
    joinWaitlist.mutate(email, {
      onSuccess: () => {
        markWaitlistJoined();
        router.push("/thank-you");
      },
    });
  };

  const handleNavClick = () =>
    document.getElementById("waitlist-input")?.focus();

  return (
    <div className="h-dvh overflow-y-auto overflow-x-hidden bg-[#0a0a0a] text-white">
      <section className="relative min-h-dvh">
        <motion.nav
          className="relative z-20 flex w-full items-center justify-between px-6 py-5 md:px-12"
          initial={shouldReduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
        >
          <span className="text-lg font-semibold tracking-tight">Sakhi AI</span>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button
              variant="outline"
              className="rounded-full border-white/15 bg-white/5 text-white shadow-[0_0_24px_-12px_rgba(59,130,246,0.55)] backdrop-blur-md transition-all duration-300 hover:border-blue-400/40 hover:bg-white/10 hover:text-white hover:shadow-[0_0_28px_-8px_rgba(59,130,246,0.65)]"
              onClick={handleNavClick}
            >
              Join Waitlist
            </Button>
          </motion.div>
        </motion.nav>

        <main className="absolute inset-0 z-10 flex items-center justify-center px-4 pb-24 pt-14 md:pb-0 md:pt-0">
          <motion.div
            className="flex w-full max-w-3xl flex-col items-center text-center"
            variants={heroVariants}
            initial={shouldReduceMotion ? false : "hidden"}
            animate="visible"
          >
            <h1 className="font-serif text-4xl font-light leading-tight tracking-tight md:text-5xl lg:text-6xl">
              Your AI assistant
              <br />
              <span className="italic text-blue-400">
                That actually does the work
              </span>
            </h1>

            <p className="mt-6 max-w-md text-neutral-400">
              Sakhi takes action across 200+ apps you already use and gets the
              work done. Join the waitlist for early access.
            </p>

            <form
              onSubmit={handleSubmit}
              className="group/form mt-10 w-full max-w-lg"
            >
              <div className="relative flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_20px_60px_-24px_rgba(59,130,246,0.55)] backdrop-blur-xl transition-all duration-300 focus-within:border-blue-400/30 focus-within:shadow-[0_0_0_1px_rgba(147,197,253,0.2)_inset,0_24px_70px_-20px_rgba(59,130,246,0.7)]">
                <div className="relative flex flex-1 items-center">
                  <Mail className="pointer-events-none absolute left-4 size-4 text-neutral-500 transition-colors duration-300 group-focus-within/form:text-blue-400/80" />
                  <Input
                    id="waitlist-input"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 border-0 bg-transparent pl-11 pr-4 text-sm text-white shadow-none placeholder:text-neutral-500 focus-visible:ring-0"
                    required
                    aria-label="Email address"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={joinWaitlist.isPending}
                  aria-busy={joinWaitlist.isPending}
                  className="h-11 rounded-full border-0 bg-white px-6 text-sm font-medium text-black shadow-[0_0_24px_-6px_rgba(255,255,255,0.5)] transition-all duration-300 hover:scale-[1.02] hover:bg-blue-50 hover:shadow-[0_0_32px_-4px_rgba(59,130,246,0.75)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-70"
                >
                  {joinWaitlist.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    "Join Waitlist"
                  )}
                </Button>
              </div>
            </form>
          </motion.div>
        </main>

        <TrustedBySection />

        <WaitlistHeroBackground />
      </section>

      <UseCasesSection />
      <WaitlistFooter />
    </div>
  );
}
