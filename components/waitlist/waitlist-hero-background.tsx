"use client";

import { motion, useReducedMotion } from "framer-motion";

const BAR_HEIGHTS = [
  100, 100, 98, 90, 78, 62, 45, 28, 16, 28, 45, 62, 78, 90, 98, 100, 100,
];
const MOBILE_BAR_HEIGHTS = [84, 70, 55, 38, 24, 15, 24, 38, 55, 70, 84];
const BAR_GRADIENT =
  "linear-gradient(to top, rgb(59 130 246) 0%, rgb(37 99 235 / 0.8) 28%, rgb(37 99 235 / 0.45) 55%, rgb(37 99 235 / 0.15) 78%, transparent 100%)";
const ease = [0.22, 1, 0.36, 1] as const;
const BAR_ANIMATION_DELAY = 0.2;

const barDelayFromCenter = (index: number, total: number) =>
  Math.abs(index - (total - 1) / 2);

const WaveBars = ({
  heights,
  className,
}: {
  heights: number[];
  className?: string;
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className={className}>
      {heights.map((h, i) => {
        const centerOffset = barDelayFromCenter(i, heights.length);
        return (
          <motion.div
            key={i}
            className="min-w-0 flex-1 origin-bottom"
            style={{ height: `${h}%` }}
            initial={shouldReduceMotion ? false : { opacity: 0, scaleY: 0.4 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{
              duration: 1,
              delay: BAR_ANIMATION_DELAY + centerOffset * 0.035,
              ease,
            }}
          >
            <div
              className={`h-full w-full origin-bottom ${shouldReduceMotion ? "" : "hero-bar-animate"}`}
              style={{
                background: BAR_GRADIENT,
                animationDelay: shouldReduceMotion
                  ? undefined
                  : `${BAR_ANIMATION_DELAY + centerOffset * 0.18}s`,
              }}
            />
          </motion.div>
        );
      })}
    </div>
  );
};

export const WaitlistHeroBackground = () => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <>
      <motion.div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-[44vh] bg-[radial-gradient(ellipse_120%_90%_at_50%_100%,rgba(59,130,246,0.55)_0%,rgba(37,99,235,0.2)_45%,transparent_80%)] lg:h-[85vh] lg:bg-[radial-gradient(ellipse_100%_100%_at_50%_100%,rgba(59,130,246,0.75)_0%,rgba(37,99,235,0.3)_40%,transparent_75%)] ${shouldReduceMotion ? "" : "hero-glow-animate"}`}
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, ease }}
      />
      <WaveBars
        heights={MOBILE_BAR_HEIGHTS}
        className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[44vh] w-full items-end gap-px lg:hidden"
      />
      <WaveBars
        heights={BAR_HEIGHTS}
        className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-[85vh] w-full items-end gap-[2px] lg:flex"
      />
    </>
  );
};
