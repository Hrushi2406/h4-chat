"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const ease = [0.22, 1, 0.36, 1] as const;

export function MarketingNavbar() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.nav
      className="relative z-20 flex w-full items-center justify-between px-6 py-5 md:px-12"
      initial={shouldReduceMotion ? false : { opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease }}
    >
      <Link
        href="/"
        className="rounded-sm text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
      >
        Sakhi AI
      </Link>

      <div className="flex items-center gap-3 sm:gap-5">
        <Link
          href="/pricing"
          className="text-sm text-neutral-400 transition-colors hover:text-white"
        >
          Pricing
        </Link>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Button
            asChild
            variant="outline"
            className="rounded-full border-white/15 bg-white/5 text-white shadow-[0_0_24px_-12px_rgba(59,130,246,0.55)] backdrop-blur-md transition-all duration-300 hover:border-blue-400/40 hover:bg-white/10 hover:text-white hover:shadow-[0_0_28px_-8px_rgba(59,130,246,0.65)]"
          >
            <Link href="/chat">Try Sakhi</Link>
          </Button>
        </motion.div>
      </div>
    </motion.nav>
  );
}
