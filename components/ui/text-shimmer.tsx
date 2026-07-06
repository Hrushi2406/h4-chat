'use client';
import React, { useMemo, type JSX } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TextShimmerProps {
  children: string;
  as?: React.ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

export function TextShimmer({
  children,
  as: Component = 'p',
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  const MotionComponent = motion(Component as keyof JSX.IntrinsicElements);

  const dynamicSpread = useMemo(() => {
    return children.length * spread;
  }, [children, spread]);

  return (
    <MotionComponent
      className={cn(
        'relative inline-block bg-[length:250%_100%,auto] bg-clip-text',
        'text-transparent [background-repeat:no-repeat,padding-box]',
        className
      )}
      initial={{ backgroundPosition: '100% center' }}
      animate={{ backgroundPosition: '0% center' }}
      transition={{
        repeat: Infinity,
        duration,
        ease: 'linear',
      }}
      style={
        {
          '--spread': `${dynamicSpread}px`,
          '--base-color': 'var(--shimmer-base, var(--muted-foreground))',
          '--base-gradient-color': 'var(--shimmer-gradient, var(--foreground))',
          '--bg':
            'linear-gradient(90deg,#0000 calc(50% - var(--spread)),color-mix(in srgb,var(--base-gradient-color) 55%,var(--base-color)) calc(50% - calc(var(--spread) * 0.35)),var(--base-gradient-color) 50%,color-mix(in srgb,var(--base-gradient-color) 55%,var(--base-color)) calc(50% + calc(var(--spread) * 0.35)),#0000 calc(50% + var(--spread)))',
          backgroundImage: `var(--bg), linear-gradient(var(--base-color), var(--base-color))`,
        } as React.CSSProperties
      }
    >
      {children}
    </MotionComponent>
  );
}
