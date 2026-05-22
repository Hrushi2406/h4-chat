"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

const RINGS = [
  { size: "100%", color: "#1a4f9c" },
  { size: "86%", color: "#153f7f" },
  { size: "72%", color: "#102f63" },
  { size: "58%", color: "#0c2349" },
  { size: "44%", color: "#081830" },
  { size: "30%", color: "#050e1c" },
] as const;

const SemicircleRing = ({ size, color }: { size: string; color: string }) => (
  <div
    aria-hidden
    className="absolute bottom-0 left-1/2 aspect-[2/1] -translate-x-1/2 rounded-t-full"
    style={{
      width: size,
      background: `linear-gradient(to top, ${color} 0%, ${color} 55%, color-mix(in srgb, ${color} 70%, #3b82f6) 100%)`,
    }}
  />
);

export const WaitlistFooter = () => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <footer className="relative overflow-hidden bg-[#0a0a0a]">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[min(52vw,480px)]"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 18%, black 38%, black 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 18%, black 38%, black 100%)",
        }}
      >
        <div className="hero-glow-animate absolute bottom-0 left-1/2 aspect-[2/1] w-[108%] -translate-x-1/2 rounded-t-full bg-[radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.28)_0%,rgba(37,99,235,0.1)_50%,transparent_72%)] blur-2xl" />
        {RINGS.map((ring) => (
          <SemicircleRing key={ring.size} {...ring} />
        ))}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.14] mix-blend-soft-light"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#0a0a0a] to-transparent" />

      <div className="relative mx-auto flex w-full flex-col items-center justify-end px-3 pb-6 pt-[clamp(7rem,28vw,15rem)] sm:px-4 sm:pb-8">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.8, ease }}
          className="relative z-10 w-full"
        >
          <Link
            href="/chat"
            className="block w-full cursor-pointer whitespace-nowrap text-center font-serif text-[clamp(4.5rem,22.5vw,15rem)] font-light leading-[0.9] tracking-[-0.05em] text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
            aria-label="Start a new chat"
          >
            Sakhi
          </Link>
        </motion.div>
        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2, ease }}
          className="relative z-10 mt-4 text-[11px] tracking-widest text-neutral-500 uppercase"
        >
          © {new Date().getFullYear()} Sakhi AI
        </motion.p>
      </div>
    </footer>
  );
};
