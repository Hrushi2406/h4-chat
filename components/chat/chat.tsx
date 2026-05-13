"use client";

import { useChat } from "@ai-sdk/react";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useState, useEffect, useMemo, useRef } from "react";
import { getDefaultModel, type AIModel } from "@/lib/available-models";
import { useThreadActions } from "@/lib/hooks/thread/use-thread-actions";
import { useThread } from "@/lib/hooks/thread/use-threads";
import {
  Attachment,
  attachmentsToFileParts,
  generateDefaultErrorMessage,
  generateDefaultUserMessage,
  normalizeThreadMessage,
  ThreadMessage,
  ThreadMessageMetadata,
} from "@/lib/types/thread";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { ChatRequestOptions, DefaultChatTransport } from "ai";
import { useUser } from "@/lib/hooks/user/use-user";
import chatService from "@/lib/services/chat-service";
import { auth } from "@/lib/clients/firebase";
import { motion, useReducedMotion } from "framer-motion";

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
  const [input, setInput] = useState("");
  const threadWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  const { uid } = useAuth();
  const { data: user } = useUser();

  const { createThread, addMessageToThread } = useThreadActions();

  // Load thread data if threadId exists
  const { data: threadData } = useThread(threadId || "", isNewThread);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
  } = useChat<ThreadMessage>({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
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
    onFinish: ({ message, messages: finishedMessages }) => {
      console.log("threadId: ", threadId);

      // Save assistant message to thread when response is complete
      if (threadId) {
        chatService.generateSuggestions(
          finishedMessages,
          false,
          "ready",
          setSuggestions
        );
        enqueueThreadWrite(() =>
          saveMessageToThread(normalizeThreadMessage(message))
        ).catch((error) => {
          console.error("Failed to save assistant message:", error);
        });
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";
  const totalTokenUsage = useMemo<ThreadMessageMetadata | undefined>(() => {
    const usage = messages.reduce(
      (total, message) => {
        const metadata = message.metadata;
        const inputTokens = metadata?.inputTokens ?? 0;
        const outputTokens = metadata?.outputTokens ?? 0;
        const totalTokens = metadata?.totalTokens ?? inputTokens + outputTokens;

        return {
          inputTokens: total.inputTokens + inputTokens,
          outputTokens: total.outputTokens + outputTokens,
          totalTokens: total.totalTokens + totalTokens,
        };
      },
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    );

    if (usage.totalTokens === 0) {
      return undefined;
    }

    return usage;
  }, [messages]);

  // Load existing thread messages when thread data is available
  useEffect(() => {
    if (threadId && threadData && messages.length === 0) {
      setMessages(threadData.messages.map(normalizeThreadMessage));
    }
  }, [threadId, threadData, messages.length]);

  const handleInputChangeWithClearSuggestions = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setInput(e.target.value);
  };

  const handleSuggestionClick = async (suggestion: string) => {
    setSuggestions([]);

    const msg = generateDefaultUserMessage(suggestion);
    enqueueThreadWrite(() => persistUserMessageBeforeSend(suggestion, msg)).catch(
      (error) => {
        console.error("Failed to save user message:", error);
      }
    );
    sendMessage({ text: suggestion }, await getChatRequestOptions()).catch(
      (error) => {
        console.error("Failed to send message:", error);
      }
    );
  };

  const enqueueThreadWrite = (write: () => Promise<void>) => {
    const queuedWrite = threadWriteQueueRef.current
      .catch(() => undefined)
      .then(write);

    threadWriteQueueRef.current = queuedWrite.catch(() => undefined);
    return queuedWrite;
  };

  const saveMessageToThread = async (message: ThreadMessage) => {
    console.log("threadId: ", threadId);

    if (!threadId) return;
    await addMessageToThread.mutateAsync({
      threadId: threadId,
      messageData: {
        ...message,

        updatedAt: new Date().toISOString(),
      },
    });
  };

  const persistUserMessageBeforeSend = async (
    title: string,
    message: ThreadMessage
  ) => {
    if (!threadId) return;

    if (isNewThread) {
      setIsCreatingThread(true);
      window.history.replaceState({}, "", `/chat/${threadId}`);

      try {
        await createThread.mutateAsync({
          threadId: threadId,
          title: title.length > 50 ? `${title.substring(0, 50)}...` : title,
          userId: uid,
          initialMessage: message,
        });

        setIsNewThread(false);
      } finally {
        setIsCreatingThread(false);
      }
      return;
    }

    await saveMessageToThread(message);
  };

  const handleStop = () => {
    stop();
  };

  const handleModelChange = (model: AIModel) => {
    setSelectedModel(model);
  };

  const handleChatSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    const submittedInput = input.trim();
    if (!submittedInput) return;

    const submittedAttachments = attachments;
    const msg = generateDefaultUserMessage(submittedInput, submittedAttachments);

    setSuggestions([]);
    setInput("");
    setAttachments([]);

    enqueueThreadWrite(() =>
      persistUserMessageBeforeSend(submittedInput, msg)
    ).catch((error) => {
      console.error("Failed to save user message:", error);
    });

    sendMessage(
      {
        text: submittedInput,
        files: attachmentsToFileParts(submittedAttachments),
      },
      await getChatRequestOptions()
    ).catch((error) => {
      console.error("Failed to send message:", error);
    });
  };

  async function getChatRequestOptions(): Promise<ChatRequestOptions> {
    return {
      body: {
        modelId: selectedModel.id,
        searchEnabled: searchEnabled,
        authToken: await auth.currentUser?.getIdToken(),
        threadId,
        userInfo: {
          name: user?.name,
          occupation: user?.occupation,
          userPreferences: user?.userPreferences,
        },
      },
    };
  }

  return (
    <div className="flex h-full flex-col">
      {messages.length === 0 && isNewThread && (
        <HomeSuggestions
          onSuggestionClick={async (suggestion) => {
            await handleSuggestionClick(suggestion);
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
        tokenUsage={totalTokenUsage}
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
  const userName = user?.name?.trim();
  const [activePrompt, setActivePrompt] = useState(0);
  const [greeting, setGreeting] = useState("Hi");
  const shouldReduceMotion = useReducedMotion();

  const promptMoods = [
    "What are we building today?",
    "Start messy. I’ll help shape it.",
    "Pick a prompt or write your own.",
  ];

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setGreeting("Good morning");
    } else if (hour < 17) {
      setGreeting("Good afternoon");
    } else {
      setGreeting("Good evening");
    }

    const interval = window.setInterval(() => {
      setActivePrompt((current) => (current + 1) % promptMoods.length);
    }, 2600);

    return () => window.clearInterval(interval);
  }, [promptMoods.length]);

  const suggestions = [
    "Turn my rough idea into a plan",
    "Help me write a sharper landing page",
    "Find what I’m missing in this strategy",
    "Draft a launch post in my voice",
    "Explain this like I’m new to it",
    "Help me make this page convert better",
    "Brainstorm names for my next project",
    "Give me a practical growth checklist",
  ];

  const pillContainerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.045,
        delayChildren: 0.08,
      },
    },
  };

  const pillVariants = {
    hidden: {
      opacity: 0,
    },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.24,
        ease: "easeOut",
      },
    },
  };

  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-6 py-10 text-center"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div className="w-full max-w-4xl space-y-7">
        <div className="space-y-2">
          <motion.p
            key={activePrompt}
            className="text-sm text-muted-foreground"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {promptMoods[activePrompt]}
          </motion.p>
          <h1 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            {greeting}
            {userName ? `, ${userName}` : ""}
          </h1>
        </div>

        <motion.div
          className="mx-auto flex max-w-3xl flex-wrap justify-center gap-3"
          variants={pillContainerVariants}
          initial={shouldReduceMotion ? false : "hidden"}
          animate="visible"
        >
          {suggestions.map((suggestion) => (
            <motion.button
              key={suggestion}
              className="max-w-full cursor-pointer rounded-full bg-secondary/70 px-5 py-3 text-sm text-muted-foreground transition-all hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base"
              variants={pillVariants}
              whileTap={{ scale: 0.99 }}
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
            </motion.button>
          ))}
        </motion.div>

        <div className="text-xs text-muted-foreground">
          <p>Type below or choose a prompt to begin.</p>
        </div>
      </div>
    </motion.div>
  );
};
