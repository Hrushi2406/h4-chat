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
import { auth } from "@/lib/clients/firebase";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useConnections } from "@/lib/hooks/connections/use-connections";
import {
  BrowserMcpServer,
  getBrowserMcpServers,
} from "@/lib/mcp-browser";

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

  const [input, setInput] = useState("");
  const [mcpServers, setMcpServers] = useState<BrowserMcpServer[]>([]);
  const threadWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const loadedThreadIdRef = useRef<string | null>(null);
  const previousThreadIdRef = useRef(threadId);

  const { uid } = useAuth();
  const { data: user } = useUser();
  const { data: toolApps = [] } = useConnections(uid);

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
        enqueueThreadWrite(() =>
          saveMessageToThread(normalizeThreadMessage(message))
        ).catch((error) => {
          console.error("Failed to save assistant message:", error);
        });
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";
  const visibleMessages = useMemo(
    () => (loadedThreadIdRef.current === threadId ? messages : []),
    [threadId, messages]
  );
  const totalTokenUsage = useMemo<ThreadMessageMetadata | undefined>(() => {
    const usage = visibleMessages.reduce(
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
  }, [visibleMessages]);

  // Clear stale messages immediately when the route changes to another thread.
  useEffect(() => {
    if (previousThreadIdRef.current === threadId) {
      return;
    }

    previousThreadIdRef.current = threadId;
    loadedThreadIdRef.current = null;
    setMessages([]);
  }, [threadId, setMessages]);

  // Replace messages when navigating between existing threads.
  useEffect(() => {
    if (!threadId || loadedThreadIdRef.current === threadId) {
      return;
    }

    if (isNewThread) {
      setMessages([]);
      loadedThreadIdRef.current = threadId;
      return;
    }

    if (!threadData) {
      return;
    }

    setMessages(threadData.messages.map(normalizeThreadMessage));
    loadedThreadIdRef.current = threadId;
  }, [threadId, threadData, isNewThread, setMessages]);

  useEffect(() => {
    const syncMcpServers = () => {
      setMcpServers(getBrowserMcpServers().filter((server) => server.enabled));
    };

    syncMcpServers();
    window.addEventListener("storage", syncMcpServers);
    window.addEventListener("mcp-servers-changed", syncMcpServers);

    return () => {
      window.removeEventListener("storage", syncMcpServers);
      window.removeEventListener("mcp-servers-changed", syncMcpServers);
    };
  }, []);

  const handleInputChangeWithClearSuggestions = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setInput(e.target.value);
  };

  const handleSuggestionClick = async (suggestion: string) => {
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
    const submittedAttachments = attachments;
    if (!submittedInput && submittedAttachments.length === 0) return;

    const submittedTitle =
      submittedInput || submittedAttachments[0]?.name || "Image attachment";
    const msg = generateDefaultUserMessage(submittedInput, submittedAttachments);

    setInput("");
    setAttachments([]);

    enqueueThreadWrite(() =>
      persistUserMessageBeforeSend(submittedTitle, msg)
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
        mcpServers,
        userInfo: {
          name: user?.name,
          occupation: user?.occupation,
          userPreferences: user?.userPreferences,
        },
      },
    };
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {visibleMessages.length === 0 && isNewThread && (
        <HomeSuggestions
          onSuggestionClick={async (suggestion) => {
            await handleSuggestionClick(suggestion);
          }}
        />
      )}

      {/* Chat Content Area */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <MessageList
          key={threadId}
          threadId={threadId}
          messages={visibleMessages}
          status={status}
          toolApps={toolApps}
          mcpServers={mcpServers}
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

type PromptSuggestion = {
  label: string;
  appName?: string;
  logo?: string;
};

const PROMPT_MOODS = [
  "What are we building today?",
  "Start messy. I’ll help shape it.",
  "Pick a prompt or write your own.",
];

const CONNECTED_APP_PROMPTS: Record<string, string> = {
  gmail: "Summarize my unread emails and draft replies",
  googlecalendar: "Check my calendar and plan today",
  googledrive: "Find the right Drive docs and summarize them",
  notion: "Turn my Notion notes into clear next steps",
  linear: "Review my Linear issues and prioritize work",
  github: "Review my GitHub issues and pull requests",
  trello: "Summarize my Trello boards and next actions",
  googledocs: "Draft and refine a Google Doc",
  googlesheets: "Analyze a Google Sheet and summarize insights",
  outlook: "Summarize my Outlook inbox and calendar",
  hubspot: "Review HubSpot contacts and deals",
  salesforce: "Summarize Salesforce records and next steps",
  confluence: "Find Confluence pages and extract action items",
  stripe: "Review Stripe customers and payments",
  googleslides: "Outline a Google Slides deck",
  googletasks: "Organize my Google Tasks",
  googlemeet: "Find Google Meet notes and follow-ups",
  googlephotos: "Find relevant Google Photos",
  google_maps: "Look up places and route details",
  google_search_console: "Summarize Search Console performance",
  shopify: "Review Shopify orders and customers",
  pexels: "Find stock photos and videos on Pexels",
  figma: "Summarize Figma project context",
  instagram: "Review recent Instagram activity",
  whatsapp: "Draft or send WhatsApp Business messages",
  strava: "Summarize my Strava activity",
  youtube: "Analyze my YouTube channel and videos",
  elevenlabs: "Create or manage ElevenLabs voice assets",
  cats: "Find cat images or breed facts",
  fal_ai: "Run a Fal.ai media generation task",
  todoist: "Organize my Todoist tasks",
  metaads: "Review Meta Ads performance",
  googleads: "Review Google Ads performance",
  reddit: "Find and summarize Reddit discussions",
  facebook: "Review Facebook pages and activity",
  linkedin: "Draft and review LinkedIn content",
  ahrefs: "Analyze SEO data in Ahrefs",
  gemini: "Use Gemini for a generation task",
  composio_search: "Search available Composio tools",
};

const DEFAULT_PROMPTS = [
  "Turn my rough idea into a plan",
  "Help me write a sharper landing page",
  "Find what I’m missing in this strategy",
  "Draft a launch post in my voice",
  "Explain this like I’m new to it",
  "Help me make this page convert better",
  "Brainstorm names for my next project",
  "Give me a practical growth checklist",
];

const HomeSuggestions = ({
  onSuggestionClick,
}: {
  onSuggestionClick: (suggestion: string) => Promise<void>;
}) => {
  const { data: user } = useUser();
  const { uid } = useAuth();
  const userName = user?.name?.trim();
  const [activePrompt, setActivePrompt] = useState(0);
  const [greeting, setGreeting] = useState("Hi");
  const shouldReduceMotion = useReducedMotion();
  const { data: toolkits = [], isLoading: areConnectionsLoading } =
    useConnections(uid);
  const connectedApps = useMemo(
    () => toolkits.filter((toolkit) => toolkit.isConnected),
    [toolkits]
  );
  const arePromptsReady = !!uid && !areConnectionsLoading;

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
      setActivePrompt((current) => (current + 1) % PROMPT_MOODS.length);
    }, 2600);

    return () => window.clearInterval(interval);
  }, []);

  const suggestions = useMemo<PromptSuggestion[]>(() => {
    const appPrompts = connectedApps.flatMap<PromptSuggestion>((app) => {
      const label = CONNECTED_APP_PROMPTS[app.slug];
      if (!label) return [];

      return [
        {
          label,
          appName: app.name,
          logo: app.logo,
        },
      ];
    });

    const genericPrompts = DEFAULT_PROMPTS.map((label) => ({ label }));
    return [...appPrompts, ...genericPrompts].slice(0, 8);
  }, [connectedApps]);

  const pillContainerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.045,
        delayChildren: 0.08,
      },
    },
  };

  const pillVariants: Variants = {
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
            {PROMPT_MOODS[activePrompt]}
          </motion.p>
          <h1 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            {greeting}
            {userName ? `, ${userName}` : ""}
          </h1>
        </div>

        <div className="flex min-h-[280px] flex-col items-center justify-start gap-7">
          {arePromptsReady && (
            <>
              <motion.div
                className="mx-auto flex max-w-3xl flex-wrap justify-center gap-3"
                variants={pillContainerVariants}
                initial={shouldReduceMotion ? false : "hidden"}
                animate="visible"
              >
                {suggestions.map((suggestion) => (
                  <motion.button
                    key={suggestion.label}
                    className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full bg-secondary/70 px-5 py-3 text-sm text-muted-foreground transition-all hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base"
                    variants={pillVariants}
                    whileTap={{ scale: 0.99 }}
                    tabIndex={0}
                    aria-label={
                      suggestion.appName
                        ? `${suggestion.appName}: ${suggestion.label}`
                        : suggestion.label
                    }
                    onClick={() => onSuggestionClick(suggestion.label)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSuggestionClick(suggestion.label);
                      }
                    }}
                  >
                    {suggestion.logo && (
                      <span
                        className="h-5 w-5 shrink-0 rounded-full bg-background bg-[length:14px_14px] bg-center bg-no-repeat"
                        style={{ backgroundImage: `url(${suggestion.logo})` }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{suggestion.label}</span>
                  </motion.button>
                ))}
              </motion.div>

              <div className="text-xs text-muted-foreground">
                <p>Type below or choose a prompt to begin.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};
