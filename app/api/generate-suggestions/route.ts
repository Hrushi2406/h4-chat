import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import {
  generateSuggestionsRequestSchema,
  generateSuggestionsResponseSchema,
  type GenerateSuggestionsResponse,
} from "./schema";
import { google } from "@ai-sdk/google";

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

    // Generate random number of suggestions between 3-6
    const maxSuggestions = Math.floor(Math.random() * 4) + 3; // 3, 4, 5, or 6

    // Get the last message for heavy influence
    const lastMessage = messages[messages.length - 1];

    // Create conversation context (last 5 messages for efficiency)
    const recentMessages = messages.slice(-5);
    const conversationContext = recentMessages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    // Create a specialized prompt for generating contextual suggestions
    const systemPrompt = `You are an AI assistant that generates helpful follow-up suggestions for conversations.

Based on the conversation history, generate ${maxSuggestions} concise, actionable suggestions that:
1. Are heavily influenced by the LAST message (most recent)
2. Consider the broader conversation context
3. Offer logical next steps, clarifications, or related topics
4. Are phrased as questions or action items the user might want to explore
5. Each suggestion should be EXACTLY 3-4 words maximum - be very concise
6. Avoid generic suggestions - be specific to the conversation
7. Use simple, direct language
8. If the last message contains a question asking "would you like to..." or similar invitation:
   - If no options are provided, make the first suggestion "Yes, I would"
   - If options are provided (e.g. "would you like to A or B"), include those options as suggestions

Current conversation context:
${conversationContext}

LAST MESSAGE (heavy influence): ${lastMessage.role}: ${lastMessage.content}

Generate suggestions that feel natural and relevant to what the user might want to ask or explore next. Keep them extremely short and punchy. Also include answer to last message questions`;

    // Generate suggestions using structured output
    const result = await generateObject({
      model: openai("gpt-4.1-nano"), // Using gpt-4.1-mini as requested
      // model: togetherai("meta-llama/Llama-4-Scout-17B-16E-Instruct"),
      // model: google("gemini-2.0-flash-lite"),
      prompt: systemPrompt,
      schema: z.object({
        suggestions: z.array(z.string()).length(maxSuggestions),
        context: z.string().optional(),
      }),
      temperature: 0.7, // Add some creativity
    });

    const response: GenerateSuggestionsResponse = {
      suggestions: result.object.suggestions,
      context: result.object.context,
    };

    // Validate response
    generateSuggestionsResponseSchema.parse(response);

    return Response.json(response);
  } catch (error) {
    console.error("Error generating suggestions:", error);

    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input format", details: error.errors },
        { status: 400 }
      );
    }

    return Response.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
