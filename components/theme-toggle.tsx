"use client";

import { useEffect, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { navToolbarSecondaryBtnClass } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const themeOptions = [
  {
    value: "light",
    label: "Light",
    vibe: "Clean and calm",
    palette: ["#ffffff", "#f4f4f5", "#18181b"],
  },
  {
    value: "dark",
    label: "Dark",
    vibe: "Classic night mode",
    palette: ["#171717", "#404040", "#f5f5f5"],
  },
  {
    value: "macha",
    label: "Macha",
    vibe: "Soft matcha daylight",
    palette: ["#fbfdf3", "#8faf55", "#2f5f35"],
  },
  {
    value: "graphite",
    label: "Graphite",
    vibe: "Charcoal and beige",
    palette: ["#171512", "#3b3730", "#d6c7a1"],
  },
  {
    value: "ocean",
    label: "Ocean",
    vibe: "Deep blue drift",
    palette: ["#082f49", "#38bdf8", "#67e8f9"],
  },
  {
    value: "rose",
    label: "Rose",
    vibe: "Soft and expressive",
    palette: ["#fff1f2", "#e11d48", "#fda4af"],
  },
  {
    value: "luxury",
    label: "Luxury",
    vibe: "Midnight luxury gold",
    palette: ["#171006", "#d6a43a", "#fff1b8"],
  },
] as const;

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const activeTheme = theme === "system" ? resolvedTheme : theme;

  useEffect(() => {
    setMounted(true);
  }, []);

  const label = mounted ? "Change theme" : "Loading theme";

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={navToolbarSecondaryBtnClass}
              aria-label={label}
              disabled={!mounted}
            >
              {mounted && isDark ? (
                <Sun className="size-4 shrink-0" strokeWidth={2} />
              ) : mounted && activeTheme === "light" ? (
                <Moon className="size-4 shrink-0" strokeWidth={2} />
              ) : (
                <Palette className="size-4 shrink-0" strokeWidth={2} />
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-72 p-2">
        <DropdownMenuLabel className="px-2 pb-2 pt-1">
          <span className="block text-sm font-semibold">Theme</span>
          <span className="text-xs font-normal text-muted-foreground">
            Pick the palette that matches your mood
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {themeOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setTheme(option.value)}
            className="cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5"
          >
            <span className="flex -space-x-1.5">
              {option.palette.map((color) => (
                <span
                  key={color}
                  className="size-5 rounded-full border border-white/60 shadow-sm ring-1 ring-black/10"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-none">
                {option.label}
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {option.vibe}
              </span>
            </span>
            {activeTheme === option.value ? (
              <Check className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
