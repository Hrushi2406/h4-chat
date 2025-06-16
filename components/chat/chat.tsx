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

interface ChatProps {
  threadId: string;
  isNew?: boolean;
}

export function Chat({ threadId, isNew = false }: ChatProps) {
  const [selectedModel, setSelectedModel] = useState<AIModel>(
    getDefaultModel()
  );

  const [isNewThread, setIsNewThread] = useState(isNew);
  const [isCreatingThread, setIsCreatingThread] = useState(false);

  const [suggestions, setSuggestions] = useState<string[]>([]);

  const router = useRouter();

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

  const handleChatSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const msg = generateDefaultUserMessage(input);
    handleSubmit(e);

    if (isNewThread) {
      // Create new thread for the first message
      setIsCreatingThread(true);
      window.history.replaceState({}, "", `/chat/${threadId}`);

      await createThread.mutateAsync({
        threadId: threadId,
        title: input.length > 50 ? `${input.substring(0, 50)}...` : input,
        userId: "user-1234",
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
      {messages.length === 0 && isNew && (
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
        <MessageList messages={messages} status={status} />
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
      />
    </div>
  );
}

const HomeSuggestions = ({
  onSuggestionClick,
}: {
  onSuggestionClick: (suggestion: string) => Promise<void>;
}) => {
  const exampleQuestions = [
    {
      title: "MCP Support",
      questions: [
        "Configure a new MCP server",
        "Server security best practices",
        "Optimize server performance",
        "Fix connection timeouts",
        "Diagnose high CPU usage",
        "Troubleshoot server crashes",
      ],
    },
    {
      title: "Tools & Features",
      questions: [
        "MCP monitoring tools",
        "Automate server backups",
        "Command line interface guide",
        "Recommended visualization tools",
        "Implement CI/CD pipelines",
        "Version control best practices",
      ],
    },
    {
      title: "General Technology",
      questions: [
        "Machine learning basics",
        "Quantum computing explained",
        "AI vs ML differences",
        "Latest tech trends",
        "Cloud computing introduction",
        "Edge computing benefits",
      ],
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto p-6 text-center">
      <div className="space-y-6 w-full">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to Saarthi AI
          </h1>
          <p className="text-muted-foreground">
            An assistant to get your jobs done using MCP and AI
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          {exampleQuestions.map((category, index) => (
            <div
              key={index}
              className="border rounded-lg p-4 bg-card shadow-sm hover:shadow-md transition-shadow"
            >
              <h3 className="font-medium text-lg mb-3">{category.title}</h3>
              <div className="space-y-2">
                {category.questions.map((question, qIndex) => (
                  <button
                    key={qIndex}
                    className="text-sm px-3 py-2 rounded-md bg-muted/50 hover:bg-muted w-full text-left transition-colors"
                    tabIndex={0}
                    aria-label={question}
                    onClick={() => onSuggestionClick(question)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSuggestionClick(question);
                      }
                    }}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-sm text-muted-foreground">
          <p>Type your question below or select from the suggestions above</p>
        </div>
      </div>
    </div>
  );
};
