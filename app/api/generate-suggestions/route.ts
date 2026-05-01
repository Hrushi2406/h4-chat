import { gateway, generateObject } from "ai";
import { z } from "zod";
import { getDefaultModel } from "@/lib/available-models";
import {
  generateSuggestionsRequestSchema,
  generateSuggestionsResponseSchema,
  type GenerateSuggestionsResponse,
} from "./schema";

const suggestionSchema = z.object({
  suggestions: z
    .array(z.string().min(1).max(80))
    .min(1)
    .max(6)
    .describe("Short follow-up suggestions for the user."),
  context: z.string().describe("Brief reason these suggestions fit."),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate input
    const validatedInput = generateSuggestionsRequestSchema.parse(body);
    const { messages } = validatedInput;

    if (messages.length === 0) {
      return Response.json(
        { error: "At least one message is required" },
        { status: 400 }
      );
    }

    const maxSuggestions = validatedInput.maxSuggestions ?? 3;

    // Get the last message for heavy influence
    const lastMessage = messages[messages.length - 1];

    // Create conversation context (last 5 messages for efficiency)
    const recentMessages = messages.slice(-5);
    const conversationContext = recentMessages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    // Create a specialized prompt for generating contextual suggestions
    const systemPrompt = `You generate helpful follow-up suggestions for a chat UI.

Based on the conversation history, generate ${maxSuggestions} concise, actionable suggestions that:
1. Are heavily influenced by the LAST message (most recent)
2. Consider the broader conversation context
3. Offer logical next steps, clarifications, or related topics
4. Are phrased as questions or action items the user might want to explore
5. Each suggestion should be 3-6 words maximum
6. Avoid generic suggestions - be specific to the conversation
7. Use simple, direct language
8. If the last message contains a question asking "would you like to..." or similar invitation:
   - If no options are provided, make the first suggestion "Yes, I would"
   - If options are provided (e.g. "would you like to A or B"), include those options as suggestions
9. Return only the structured object matching the schema

Current conversation context:
${conversationContext}

LAST MESSAGE (heavy influence): ${lastMessage.role}: ${lastMessage.content}

Generate suggestions that feel natural and relevant to what the user might want to ask or explore next.`;

    // Generate suggestions using structured output
    const result = await generateObject({
      model: gateway.languageModel(getDefaultModel().id),
      prompt: systemPrompt,
      schema: suggestionSchema,
      schemaName: "FollowUpSuggestions",
      schemaDescription: "Contextual follow-up suggestions for a chat app.",
      maxOutputTokens: 300,
    });

    const response: GenerateSuggestionsResponse = {
      suggestions: result.object.suggestions
        .map((suggestion) => suggestion.trim())
        .filter(Boolean)
        .slice(0, maxSuggestions),
      context: result.object.context || undefined,
    };

    // Validate response
    generateSuggestionsResponseSchema.parse(response);

    return Response.json(response);
  } catch (error) {
    console.error("Error generating suggestions:", error);

    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input format", details: error.issues },
        { status: 400 }
      );
    }

    return Response.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
