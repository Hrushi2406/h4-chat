"use client";

import { Message, useChat } from "@ai-sdk/react";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useState, useEffect } from "react";
import { getDefaultModel, type AIModel } from "@/lib/available-models";
import { v4 } from "uuid";
import { apiClient } from "@/lib/clients/axios-client";
import { useThreadActions } from "@/lib/hooks/thread/use-thread-actions";
import { useThread } from "@/lib/hooks/thread/use-threads";
import { useRouter } from "next/navigation";
import {
  generateDefaultErrorMessage,
  generateDefaultUserMessage,
} from "@/lib/types/thread";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { Attachment, ChatRequestOptions } from "ai";
import { useUser } from "@/lib/hooks/user/use-user";
import chatService from "@/lib/services/chat-service";

interface ChatProps {
  threadId: string;
  isNew?: boolean;
}

export function Chat({ threadId, isNew = false }: ChatProps) {
  const [selectedModel, setSelectedModel] = useState<AIModel>(
    getDefaultModel()
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const [isNewThread, setIsNewThread] = useState(isNew);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState<boolean>(false);

  const [suggestions, setSuggestions] = useState<string[]>([]);

  const router = useRouter();

  const { uid } = useAuth();
  const { data: user } = useUser();

  const { createThread, addMessageToThread } = useThreadActions();

  // Load thread data if threadId exists
  const { data: threadData } = useThread(threadId || "", isNewThread);

  const {
    messages,
    setMessages,
    input,
    handleInputChange,
    handleSubmit,
    append,
    isLoading,
    status,
    stop,
  } = useChat({
    api: "/api/chat",
    body: {
      modelId: selectedModel.id,
      searchEnabled: searchEnabled,
      userInfo: {
        name: user?.name,
        occupation: user?.occupation,
        userPreferences: user?.userPreferences,
      },
    },
    onError: (error) => {
      const msg = generateDefaultErrorMessage(
        error.message ||
          "I'm sorry, I'm having trouble processing your request. Please try again later."
      );
      setMessages((prevMessages) => [...prevMessages, msg]);
    },
    onToolCall: ({ toolCall }) => {
      console.log("Tool call: ", toolCall);
    },
    onFinish: (message, options) => {
      console.log("Finish: ", options);
      console.log("threadId: ", threadId);

      // Save assistant message to thread when response is complete
      if (threadId) {
        chatService.generateSuggestions(
          messages,
          isLoading,
          status,
          setSuggestions
        );
        saveMessageToThread(message);
      }
    },
  });

  // Load existing thread messages when thread data is available
  useEffect(() => {
    if (threadId && threadData && messages.length === 0) {
      setMessages(threadData.messages);
    }
  }, [threadId, threadData, messages.length]);

  const handleInputChangeWithClearSuggestions = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    handleInputChange(e);
  };

  const handleSuggestionClick = async (suggestion: string) => {
    setSuggestions([]);

    const msg = generateDefaultUserMessage(suggestion);
    append(msg);
    saveMessageToThread(msg);
  };

  const saveMessageToThread = (message: Message) => {
    console.log("threadId: ", threadId);

    if (!threadId) return;
    addMessageToThread.mutate({
      threadId: threadId,
      messageData: {
        ...message,

        updatedAt: new Date().toISOString(),
      },
    });
  };

  const handleStop = () => {
    stop();
  };

  const handleModelChange = (model: AIModel) => {
    setSelectedModel(model);
  };

  const handleChatSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
    options: ChatRequestOptions
  ) => {
    e.preventDefault();

    const msg = generateDefaultUserMessage(input, attachments);

    handleSubmit(e, options);

    setAttachments([]);

    if (isNewThread) {
      // Create new thread for the first message
      setIsCreatingThread(true);
      window.history.replaceState({}, "", `/chat/${threadId}`);

      await createThread.mutateAsync({
        threadId: threadId,
        title: input.length > 50 ? `${input.substring(0, 50)}...` : input,
        userId: uid,
        initialMessage: msg,
      });

      setIsNewThread(false);
      setIsCreatingThread(false);
    } else {
      saveMessageToThread(msg);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {messages.length === 0 && isNewThread && (
        <HomeSuggestions
          onSuggestionClick={async (suggestion) => {
            handleInputChange({
              target: {
                value: suggestion,
              },
            } as React.ChangeEvent<HTMLTextAreaElement>);
          }}
        />
      )}

      {/* Chat Content Area */}
      <div className="flex-1 overflow-y-auto">
        <MessageList
          messages={messages}
          status={status}
          suggestions={suggestions}
          onSuggestionClick={handleSuggestionClick}
        />
      </div>

      {/* Chat Input */}
      <ChatInput
        input={input}
        isLoading={isLoading || isCreatingThread}
        handleInputChange={handleInputChangeWithClearSuggestions}
        handleSubmit={handleChatSubmit}
        onStop={handleStop}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        attachments={attachments}
        setAttachments={setAttachments}
        searchEnabled={searchEnabled}
        setSearchEnabled={setSearchEnabled}
      />
    </div>
  );
}

const HomeSuggestions = ({
  onSuggestionClick,
}: {
  onSuggestionClick: (suggestion: string) => Promise<void>;
}) => {
  const { data: user } = useUser();
  const userName = user?.name || "there";

  const suggestions = [
    "Create a landing page for my SaaS",
    "Latest news in AI",
    "What is the meaning of life?",
    "Help me optimize my website SEO",
    "Product Hunt launch guide",
    "Create an email campaign",
    "Generate tweet for build in public",
    "Explain AI concepts in simple terms",
    "How do I get more users?",
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto p-6 text-center">
      <div className="space-y-6 w-full">
        <div className="space-y-2">
          <h1 className="text-3xl font-medium tracking-tight">
            What's on your mind{`, ${userName}` || ""}?
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 w-full">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              className="cursor-pointer text-sm px-3 py-2 rounded-md bg-secondary/80 text-gray-700 hover:bg-secondary/80 w-full text-left transition-colors"
              tabIndex={0}
              aria-label={suggestion}
              onClick={() => onSuggestionClick(suggestion)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSuggestionClick(suggestion);
                }
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="mt-6 text-xs text-muted-foreground">
          <p>Type your question below or select from the suggestions above</p>
        </div>
      </div>
    </div>
  );
};
