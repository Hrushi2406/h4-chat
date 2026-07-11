"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: 0.4, ease, staggerChildren: 0.04 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
};

const logoImgClass =
  "h-4 w-auto object-contain opacity-75 brightness-0 invert transition-all duration-300 group-hover:opacity-100 group-hover:brightness-100 group-hover:invert-0 sm:h-5";

const textClass =
  "text-sm font-medium text-neutral-200 opacity-75 transition-all duration-300 group-hover:text-white group-hover:opacity-100";

const LOGOS = [
  { src: "/logos/hubspot.svg", alt: "HubSpot" },
  { src: "/logos/microsoft.svg", alt: "Microsoft" },
  { src: "/logos/jpmorgan.svg", alt: "J.P. Morgan" },
  { src: "/logos/mercari.svg", alt: "Mercari" },
  { src: "/logos/interactive-brokers.svg", alt: "Interactive Brokers" },
];

export const TrustedBySection = () => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className="absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-4 px-4 sm:bottom-8"
      variants={containerVariants}
      initial={shouldReduceMotion ? false : "hidden"}
      animate="visible"
    >
      <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
        Used by people at
      </span>
      <div className="flex w-full max-w-2xl flex-wrap items-center justify-center gap-x-7 gap-y-3 sm:gap-x-9">
        <motion.div
          variants={itemVariants}
          className="group flex shrink-0 items-center gap-1.5"
        >
          <img src="/logos/ycombinator.svg" alt="Y Combinator" className={logoImgClass} />
          <span className={textClass}>Combinator</span>
        </motion.div>

        {LOGOS.map((logo) => (
          <motion.div
            key={logo.src}
            variants={itemVariants}
            className="group shrink-0"
          >
            <img src={logo.src} alt={logo.alt} className={logoImgClass} />
          </motion.div>
        ))}

        <motion.div
          variants={itemVariants}
          className="group flex shrink-0 items-center gap-1.5"
        >
          <img
            src="/logos/maharashtra.svg"
            alt="Government of Maharashtra"
            className={logoImgClass}
          />
          <span className={textClass}>Government of Maharashtra</span>
        </motion.div>
      </div>
    </motion.div>
  );
};
