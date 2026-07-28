"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import { WaitlistFooter } from "@/components/waitlist/waitlist-footer";
import { UseCasesSection } from "@/components/waitlist/use-cases-section";
import { WaitlistHeroBackground } from "@/components/waitlist/waitlist-hero-background";
import { TrustedBySection } from "@/components/waitlist/trusted-by-section";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { WhatsAppLogo as WhatsAppIcon } from "@/lib/brand-logos";
import { WHATSAPP_COMMUNITY_URL } from "@/lib/constants";

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
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="h-dvh overflow-y-auto overflow-x-hidden bg-[#0a0a0a] text-white">
      <section className="relative min-h-dvh">
        <MarketingNavbar />

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
              work done. Sign in to start getting more done.
            </p>

            <div className="mt-10 flex items-center justify-center gap-3">
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Button
                  onClick={() => router.push("/chat")}
                  className="h-12 whitespace-nowrap rounded-full border-0 bg-white px-8 text-sm font-medium text-black shadow-[0_0_24px_-6px_rgba(255,255,255,0.5)] transition-all duration-300 hover:bg-blue-50 hover:shadow-[0_0_32px_-4px_rgba(59,130,246,0.75)]"
                >
                  Try Sakhi
                </Button>
              </motion.div>

              <a
                href={WHATSAPP_COMMUNITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Join WhatsApp community for faster access"
                className="group/wa inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm text-neutral-300 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-blue-400/30 hover:bg-white/[0.08] hover:text-blue-400/90 active:scale-[0.98]"
              >
                <WhatsAppIcon className="size-4 text-neutral-500 transition-colors duration-300 group-hover/wa:text-blue-400/90" />
                Join WhatsApp
              </a>
            </div>
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
