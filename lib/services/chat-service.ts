import { apiClient } from "../clients/axios-client";
import { GenerateSuggestionsResponse } from "@/app/api/generate-suggestions/schema";
import { getMessageContent, ThreadMessage } from "@/lib/types/thread";

class ChatService {
  async generateSuggestions(
    messages: ThreadMessage[],
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
              content: getMessageContent(msg),
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
