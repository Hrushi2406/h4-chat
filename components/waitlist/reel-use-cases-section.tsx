"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import {
  FEATURED_DEMO,
  getInstagramReelUrl,
  getReelPosterPath,
  getYouTubeEmbedUrl,
  REEL_USE_CASES,
  type ReelUseCase,
} from "@/lib/reel-use-cases";

const ease = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay: i * 0.08, ease },
  }),
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
};

/** Poster façade — YouTube's player only loads once someone hits play. */
const FeaturedDemo = () => {
  const shouldReduceMotion = useReducedMotion();
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <motion.div
      className="mx-auto mt-14 w-full max-w-3xl px-4 sm:mt-16 sm:px-6 lg:max-w-4xl xl:max-w-5xl"
      initial={shouldReduceMotion ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={cardVariants}
    >
      <div className="group/demo relative aspect-video overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0c] shadow-[0_0_60px_-20px_rgba(59,130,246,0.5)]">
        {isPlaying ? (
          <iframe
            src={getYouTubeEmbedUrl(FEATURED_DEMO.youtubeId)}
            title={FEATURED_DEMO.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsPlaying(true)}
            aria-label={`Play ${FEATURED_DEMO.title}`}
            className="absolute inset-0 size-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            <Image
              src={FEATURED_DEMO.poster}
              alt={FEATURED_DEMO.title}
              fill
              sizes="(min-width: 1280px) 1024px, (min-width: 1024px) 896px, (min-width: 768px) 768px, 100vw"
              className="object-cover transition-transform duration-500 group-hover/demo:scale-[1.02]"
              priority={false}
            />
            <span
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10"
            />
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/35 backdrop-blur-md transition-all duration-300 group-hover/demo:scale-105 group-hover/demo:border-white/40 group-hover/demo:bg-black/50"
            >
              <Play className="size-6 translate-x-px fill-white text-white" />
            </span>
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-sm leading-relaxed text-neutral-500">
        {FEATURED_DEMO.description}
      </p>
    </motion.div>
  );
};

const ReelCard = ({ reel }: { reel: ReelUseCase }) => (
  <motion.article variants={cardVariants} className="w-[300px] shrink-0 snap-start">
    <a
      href={getInstagramReelUrl(reel.code)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Watch “${reel.title}” on Instagram`}
      className="group/reel block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
    >
      <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0c] transition-colors duration-300 group-hover/reel:border-blue-400/25">
        <Image
          src={getReelPosterPath(reel.code)}
          alt={reel.title}
          fill
          sizes="300px"
          className="object-cover transition-transform duration-500 group-hover/reel:scale-[1.03]"
        />

        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/15"
        />

        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/30 backdrop-blur-md transition-all duration-300 group-hover/reel:scale-105 group-hover/reel:border-white/40 group-hover/reel:bg-black/40"
        >
          <Play className="size-5 translate-x-px fill-white text-white" />
        </span>
      </div>

      <p className="mt-4 px-2 text-center text-sm leading-relaxed text-neutral-500 transition-colors duration-300 group-hover/reel:text-neutral-300">
        {reel.description}
      </p>
    </a>
  </motion.article>
);

export const ReelUseCasesSection = () => {
  const shouldReduceMotion = useReducedMotion();
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const syncScrollState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const maxScroll = rail.scrollWidth - rail.clientWidth;
    setCanScrollLeft(rail.scrollLeft > 8);
    setCanScrollRight(rail.scrollLeft < maxScroll - 8);
  }, []);

  useEffect(() => {
    syncScrollState();
    window.addEventListener("resize", syncScrollState);
    return () => window.removeEventListener("resize", syncScrollState);
  }, [syncScrollState]);

  const scrollByCard = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.querySelector("article");
    const step = card ? card.clientWidth + 24 : rail.clientWidth * 0.8;
    rail.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  return (
    <section
      id="in-action"
      className="relative z-10 overflow-hidden border-t border-white/[0.06] bg-[#0a0a0a]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(59,130,246,0.16)_0%,transparent_70%)]" />

      <div className="relative py-24 sm:py-32">
        <motion.div
          className="mx-auto max-w-3xl px-4 text-center sm:px-6"
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
            Whatever you&apos;re stuck on.
            <br />
            <span className="italic text-blue-400">Consider it done.</span>
          </motion.h2>
          <motion.p
            custom={1}
            variants={fadeUp}
            className="mt-5 text-sm leading-relaxed text-neutral-400 sm:text-base"
          >
            Cracking DSA. Rewriting a resume. Shipping a first pull request.
            Landing the internship.
          </motion.p>
        </motion.div>

        <FeaturedDemo />

        <div className="relative mt-14 sm:mt-16">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-10 bg-gradient-to-r from-[#0a0a0a] to-transparent sm:w-20" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-[#0a0a0a] to-transparent sm:w-20" />

          <motion.div
            ref={railRef}
            onScroll={syncScrollState}
            className="flex snap-x snap-proximity gap-6 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:px-6 md:px-12 [&::-webkit-scrollbar]:hidden"
            initial={shouldReduceMotion ? false : "hidden"}
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.08 } },
            }}
          >
            {REEL_USE_CASES.map((reel) => (
              <ReelCard key={reel.code} reel={reel} />
            ))}
            <div aria-hidden className="w-1 shrink-0 sm:w-6" />
          </motion.div>

          <div className="mt-10 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => scrollByCard(-1)}
              disabled={!canScrollLeft}
              aria-label="Previous demos"
              className="inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-300 backdrop-blur-xl transition-all duration-300 hover:border-blue-400/30 hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollByCard(1)}
              disabled={!canScrollRight}
              aria-label="More demos"
              className="inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-300 backdrop-blur-xl transition-all duration-300 hover:border-blue-400/30 hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
