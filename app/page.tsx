"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send } from "lucide-react";
import { MessageList } from "@/components/chat/message-list";
import { useChat } from "@ai-sdk/react";
import { AIModel, getDefaultModel } from "@/lib/available-models";
import { generateDefaultUserMessage } from "@/lib/types/message";
import { ChatInput } from "@/components/chat/chat-input";

export default function ChatPage() {
  const [selectedModel, setSelectedModel] = useState<AIModel>(
    getDefaultModel()
  );

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    status,
    stop,
  } = useChat({
    api: "/api/chat",
    body: {
      modelId: selectedModel.id,
    },
  });

  const handleStop = () => {
    stop();
  };

  const handleModelChange = (model: AIModel) => {
    setSelectedModel(model);
  };

  const handleChatSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(e);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} status={status} />
      </div>

      {/* Chat Input */}
      <ChatInput
        input={input}
        isLoading={isLoading}
        handleInputChange={handleInputChange}
        handleSubmit={handleChatSubmit}
        onStop={handleStop}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
      />
    </div>
  );
}
