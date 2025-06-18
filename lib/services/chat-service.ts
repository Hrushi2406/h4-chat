import { Message } from "ai";
import { apiClient } from "../clients/axios-client";
import { GenerateSuggestionsResponse } from "@/app/api/generate-suggestions/schema";

class ChatService {
  async generateSuggestions(
    messages: Message[],
    isLoading: boolean,
    status: string,
    setSuggestions: (suggestions: string[]) => void
  ): Promise<void> {
    if (
      messages.length > 1 &&
      !isLoading &&
      status === "ready" &&
      messages[messages.length - 1]?.role === "assistant"
    ) {
      try {
        const response = await apiClient.post<GenerateSuggestionsResponse>(
          "/generate-suggestions",
          {
            messages: messages.map((msg) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
            })),
          }
        );
        setSuggestions(response.data.suggestions || []);
      } catch (error) {
        console.error("Error generating suggestions:", error);
        setSuggestions([]);
      }
    }
  }
}

const chatService = new ChatService();

export default chatService;
