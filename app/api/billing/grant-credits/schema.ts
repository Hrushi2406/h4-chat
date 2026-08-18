import { z } from "zod";
import {
  COMPLIMENTARY_ONE_TIME_CREDITS,
  DEFAULT_COMPLIMENTARY_GRANT_KEY,
} from "@/lib/billing/config";
import type { BillingSummary } from "@/lib/billing/types";

export const grantCreditsRequestSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    credits: z
      .number()
      .int()
      .positive()
      .default(COMPLIMENTARY_ONE_TIME_CREDITS),
    grantKey: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/, {
        message:
          "grantKey must start with a letter or number and use only letters, numbers, underscores, or hyphens",
      })
      .default(DEFAULT_COMPLIMENTARY_GRANT_KEY),
  })
  .refine((value) => Boolean(value.userId || value.email), {
    message: "userId or email is required",
  });

export type GrantCreditsRequest = z.infer<typeof grantCreditsRequestSchema>;

export type GrantCreditsResponse = {
  granted: boolean;
  duplicate: boolean;
  userId: string;
  grantId: string;
  creditsGranted: number;
  billing: BillingSummary;
};
