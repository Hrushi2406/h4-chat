import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { smoothStream, streamText } from "ai";
import { Geo, geolocation } from "@vercel/functions";
import { z } from "zod";
import { getModelById } from "@/lib/available-models";

export async function POST(req: Request) {
  const {
    messages,
    modelId = "gemini-2.0-flash-exp",
    searchEnabled = false,
    userInfo,
  } = await req.json();

  const geo = geolocation(req);
  const model = getModelById(modelId);

  if (!model) {
    return new Response("Invalid model ID", { status: 400 });
  }

  console.log("using model: ", model.id);

  const systemPrompt = getSystemPrompt(geo, searchEnabled, userInfo);

  const result = streamText({
    model: model.provider === "google" ? google(modelId) : openai(modelId),
    system: systemPrompt,
    messages: messages.slice(-10),
    maxSteps: 5,
    onError: (error) => {
      console.log("error: ", error);
    },
    tools: {
      webSearch: {
        description: `Search the web for current information, facts, recent events, or detailed explanations.
    
        Use this tool when:
        - User asks about current events or recent news
        - Questions require up-to-date information
        - User asks for specific facts that might not be in your training data
        - User requests recent developments on any topic
        - Questions about current stock prices, weather, or time-sensitive data
        
        The tool provides both instant answers and web search results with sources.`,
        parameters: z.object({
          query: z.string(),
        }),
        execute: async ({ query }) => {
          const results = await webSearch(query);
          return results;
        },
      },
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

const getSystemPrompt = (
  geo: Geo,
  searchEnabled: boolean,
  userInfo: Partial<IUser>
) => {
  const requestHints = getRequestPromptFromHints(geo);

  const { name, occupation, userPreferences } = userInfo;

  return `You are a helpful AI assistant that provides clear, concise, and well-formatted responses in markdown.

   Guidelines:
    - End with a brief, contextual suggestion for next steps
    - Include one relevant follow-up question
    - ${
      searchEnabled &&
      `Use the webSearch tool for any information that requires current data. You MUST use this tool when answering questions about recent events, facts, or information that might not be in your training data.`
    }

    ${name && `User's name is ${name}`}
    ${occupation && `User's occupation is ${occupation}`}
    ${userPreferences && `User's preferences are ${userPreferences}`}


    Example suggestion format:
    "Would you like to explore [related topic] or learn more about [specific aspect]?"

    ${requestHints}
    `;
};

// Google Custom Search API integration
import axios from "axios";
import { IUser } from "@/lib/types/user";

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  source: string;
}

/**
 * Performs a web search using Google Custom Search JSON API
 * @param query The search query
 * @returns Array of search results
 */
async function webSearch(query: string): Promise<SearchResult[]> {
  try {
    const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
    const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

    if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
      console.error("Missing Google API Key or CSE ID");
      return [];
    }

    const response = await axios.get(
      "https://www.googleapis.com/customsearch/v1",
      {
        params: {
          key: GOOGLE_API_KEY,
          cx: GOOGLE_CSE_ID,
          q: query,
          num: 5, // Number of results to return
        },
      }
    );

    if (!response.data.items || response.data.items.length === 0) {
      return [];
    }

    return response.data.items.map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      source: item.displayLink,
    }));
  } catch (error) {
    console.error("Web search error:", error);
    return [];
  }
}
