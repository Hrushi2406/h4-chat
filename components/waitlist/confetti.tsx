"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

const COLORS = ["#60a5fa", "#3b82f6", "#93c5fd", "#ffffff", "#2563eb"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rotation: number;
  spin: number;
  opacity: number;
};

const createParticles = (count: number, w: number, h: number): Particle[] =>
  Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: -20 - Math.random() * h * 0.4,
    vx: (Math.random() - 0.5) * 6,
    vy: 2 + Math.random() * 5,
    w: 6 + Math.random() * 6,
    h: 3 + Math.random() * 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * 360,
    spin: (Math.random() - 0.5) * 12,
    opacity: 0.7 + Math.random() * 0.3,
  }));

export const Confetti = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let particles = createParticles(120, window.innerWidth, window.innerHeight);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      particles = particles.filter((p) => p.y < height + 40 && p.opacity > 0.02);

      if (particles.length < 80) {
        particles.push(...createParticles(12, width, height * 0.15));
      }

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        p.vx *= 0.99;
        p.rotation += p.spin;
        p.opacity -= 0.0015;

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      raf = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [shouldReduceMotion]);

  if (shouldReduceMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-30"
    />
  );
};
