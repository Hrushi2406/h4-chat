import { clsx, type ClassValue } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const blurBackground =
  "bg-background/80 backdrop-blur-sm border border-border/50";

export const handleError = (error: unknown, customMessage?: string) => {
  const errorMessage =
    error instanceof Error
      ? error.message
      : customMessage || "An unknown error occurred";

  // Log the full error to console for debugging
  console.error("Error: ", error);

  // Show user-friendly toast
  toast.error(errorMessage);
};
