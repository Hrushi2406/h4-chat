import { z } from "zod";

// Input schema for generating suggestions
export const generateSuggestionsRequestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ),
  maxSuggestions: z.number().min(1).max(6).default(3),
});

// Response schema for suggestions
export const generateSuggestionsResponseSchema = z.object({
  suggestions: z.array(z.string()),
  context: z.string().optional(),
});

export type GenerateSuggestionsRequest = z.infer<
  typeof generateSuggestionsRequestSchema
>;
export type GenerateSuggestionsResponse = z.infer<
  typeof generateSuggestionsResponseSchema
>;
