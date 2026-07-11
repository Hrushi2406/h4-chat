"use client";

import {
  getComposioLogoUrl,
  WAITLIST_USE_CASE_CATEGORIES,
} from "@/lib/waitlist-use-cases";
import { motion, useReducedMotion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay: i * 0.08, ease },
  }),
};

const categoryVariants = {
  hidden: { opacity: 0, y: 36 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease },
  },
};

const pillContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.12 } },
};

const pillVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease },
  },
};

const PillGlowOrbit = ({ variant }: { variant: "border" | "fill" }) => (
  <div
    aria-hidden
    className={`pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover/pill:opacity-100 ${
      variant === "border" ? "pill-glow-travel-border" : "pill-glow-travel-fill"
    }`}
  />
);

const UseCasePill = ({
  slug,
  appName,
  prompt,
}: {
  slug: string;
  appName: string;
  prompt: string;
}) => (
  <motion.div
    variants={pillVariants}
    whileHover={{ y: -1, transition: { duration: 0.2 } }}
    className="group/pill relative inline-flex rounded-full p-px"
  >
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full bg-white/[0.08] transition-opacity duration-300 group-hover/pill:opacity-0"
    />
    <PillGlowOrbit variant="border" />
    <div className="relative inline-flex max-w-full items-center gap-2.5 overflow-hidden rounded-full bg-[#0c0c0c] px-2 py-2 pr-4 sm:gap-3 sm:py-2.5 sm:pl-2.5 sm:pr-5">
      <PillGlowOrbit variant="fill" />
      <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10 sm:size-7">
        <img
          src={getComposioLogoUrl(slug)}
          alt={appName}
          className="size-full object-contain"
          loading="lazy"
        />
      </span>
      <span className="relative z-10 min-w-0 text-left text-[13px] leading-snug text-neutral-300 transition-colors duration-300 group-hover/pill:text-white sm:text-sm">
        {prompt}
      </span>
    </div>
  </motion.div>
);

export const UseCasesSection = () => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section
      id="use-cases"
      className="relative z-10 overflow-hidden border-t border-white/[0.06] bg-[#0a0a0a]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_70%_55%_at_50%_0%,rgba(59,130,246,0.22)_0%,transparent_70%)]" />

      <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 md:px-12">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial={shouldReduceMotion ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.1 } },
          }}
        >
          <motion.h2
            custom={0}
            variants={fadeUp}
            className="font-serif text-3xl font-light tracking-tight text-white sm:text-4xl md:text-5xl"
          >
            Tell it what to do.
            <br />
            <span className="italic text-blue-400">Sakhi gets it done.</span>
          </motion.h2>
          <motion.p
            custom={1}
            variants={fadeUp}
            className="mt-5 text-sm leading-relaxed text-neutral-400 sm:text-base"
          >
            Works with 200+ apps you already use. Summarize emails, update
            tasks, review PRs, pull reports — all in one conversation.
          </motion.p>
        </motion.div>

        <div className="mt-16 space-y-0 sm:mt-20">
          {WAITLIST_USE_CASE_CATEGORIES.map((category, index) => (
            <motion.article
              key={category.id}
              initial={shouldReduceMotion ? false : "hidden"}
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={categoryVariants}
              className="grid gap-6 border-t border-white/[0.06] py-12 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-10 sm:py-16 lg:grid-cols-[minmax(0,260px)_1fr] lg:gap-16"
            >
              <header className="sm:sticky sm:top-28 sm:self-start">
                <motion.span
                  initial={shouldReduceMotion ? false : { opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.05, ease }}
                  className="font-serif text-5xl leading-none text-[rgb(96_165_250/0.15)] sm:text-6xl"
                >
                  {String(index + 1).padStart(2, "0")}
                </motion.span>
                <h3 className="mt-3 font-serif text-xl text-white sm:text-2xl">
                  {category.label}
                </h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-neutral-500">
                  {category.tagline}
                </p>
              </header>

              <motion.div
                className="flex flex-wrap gap-2.5 sm:gap-3"
                variants={pillContainerVariants}
                initial={shouldReduceMotion ? false : "hidden"}
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
              >
                {category.cases.map((useCase) => (
                  <UseCasePill key={useCase.slug} {...useCase} />
                ))}
              </motion.div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
};
