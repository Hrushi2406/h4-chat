import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { Geo, geolocation } from "@vercel/functions";
import { getModelById } from "@/lib/available-models";

export async function POST(req: Request) {
  const { messages, modelId = "gemini-2.0-flash-exp" } = await req.json();

  const geo = geolocation(req);
  const model = getModelById(modelId);

  if (!model) {
    return new Response("Invalid model ID", { status: 400 });
  }

  console.log("using model: ", model.id);

  const systemPrompt = getSystemPrompt(geo);

  const result = streamText({
    model: model.provider === "google" ? google(modelId) : openai(modelId),
    system: systemPrompt,
    messages: messages.slice(-10),
    maxSteps: 5,
    onError: (error) => {
      console.log("error: ", error);
    },
  });

  return result.toDataStreamResponse({
    getErrorMessage: (error) => {
      if (error instanceof Error) {
        return error.message;
      }
      return "An unknown error occurred";
    },
  });
}

const getRequestPromptFromHints = (geo: Geo) => `\
About the origin of user's request:
- lat: ${geo.longitude}
- lon: ${geo.latitude}
- city: ${geo.city}
- country: ${geo.country}
`;

const getSystemPrompt = (geo: Geo) => {
  const requestHints = getRequestPromptFromHints(geo);

  return `You are a helpful AI assistant that provides clear, concise, and well-formatted responses in markdown.

    Guidelines:
    - Keep responses short and concise unless the user asks for detailed information
    - End with a brief, contextual suggestion for next steps
    - Include one relevant follow-up question
    - Use proper formatting for readability

    Example suggestion format:
    "Would you like to explore [related topic] or learn more about [specific aspect]?"

    ${requestHints}
    `;
};
