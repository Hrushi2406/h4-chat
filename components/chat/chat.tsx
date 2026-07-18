"use client";

import { useChat } from "@ai-sdk/react";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getDefaultModel, type AIModel } from "@/lib/available-models";
import { useThreadActions } from "@/lib/hooks/thread/use-thread-actions";
import { threadKeys, useThread } from "@/lib/hooks/thread/use-threads";
import {
  Attachment,
  attachmentsToFileParts,
  generateDefaultErrorMessage,
  generateDefaultUserMessage,
  normalizeThreadMessage,
  Thread,
  ThreadMessage,
  ThreadMessageMetadata,
} from "@/lib/types/thread";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { ChatRequestOptions, DefaultChatTransport } from "ai";
import { useUser } from "@/lib/hooks/user/use-user";
import { auth } from "@/lib/clients/firebase";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  connectionKeys,
  useConnections,
} from "@/lib/hooks/connections/use-connections";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useMcpServers } from "@/lib/hooks/mcp/use-mcp-servers";
import type { ThreadCursor, ThreadsPage } from "@/lib/services/thread-service";

interface ChatProps {
  threadId: string;
  isNew?: boolean;
}

type QueuedChatMessage = {
  id: string;
  text: string;
  attachments: Attachment[];
};

type ThreadsInfiniteData = InfiniteData<ThreadsPage, ThreadCursor | null>;
type GeneratedTitleResponse = {
  title?: string;
  skipped?: boolean;
};

let newThreadDraft = "";
let consumedPromptFromUrl: string | undefined;

const promptFromUrlStorageKey = (prompt: string) =>
  `prompt-from-url-sent:${prompt}`;

const readNewThreadDraft = () => newThreadDraft;

const writeNewThreadDraft = (draft: string) => {
  newThreadDraft = draft;
};

const clearPromptFromUrl = () => {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has("prompt")) return;

  url.searchParams.delete("prompt");
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
};

const updateThreadTitleInList = (
  data: ThreadsInfiniteData | undefined,
  threadId: string,
  title: string,
): ThreadsInfiniteData | undefined => {
  if (!data) return data;

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      threads: page.threads.map((thread) =>
        thread.id === threadId
          ? { ...thread, title, titleSource: "generated" }
          : thread,
      ),
    })),
  };
};

export function Chat({ threadId, isNew = false }: ChatProps) {
  const [selectedModel, setSelectedModel] =
    useState<AIModel>(getDefaultModel());

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const [isNewThread, setIsNewThread] = useState(isNew);
  const [isCreatingThread, setIsCreatingThread] = useState(false);

  const [input, setInput] = useState("");
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);
  const [isSendingQueuedMessage, setIsSendingQueuedMessage] = useState(false);
  const threadWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const loadedThreadIdRef = useRef<string | null>(null);
  const previousThreadIdRef = useRef(threadId);
  const composioAuthResumeStartedRef = useRef(false);
  const promptFromUrlSentRef = useRef(false);
  const pendingQueuedMessageIdRef = useRef<string | null>(null);

  const { uid } = useAuth();
  const queryClient = useQueryClient();
  const { data: toolApps = [], refetch: refetchConnections } =
    useConnections(uid);
  const { data: savedMcpServers = [], isFetched: mcpServersFetched } =
    useMcpServers(uid);
  const mcpServers = useMemo(
    () => savedMcpServers.filter((server) => server.enabled),
    [savedMcpServers],
  );
  // Only skip MCP on the server when we know the user has none; while loading,
  // omit the flag so the API still fetches (safe for first paint / cache miss).
  const hasMcpServers = mcpServersFetched ? mcpServers.length > 0 : undefined;
  const hasMcpServersRef = useRef(hasMcpServers);
  hasMcpServersRef.current = hasMcpServers;

  const { createThread, addMessageToThread } = useThreadActions();

  // Load thread data if threadId exists
  const { data: threadData } = useThread(threadId || "", isNewThread);

  const { messages, setMessages, sendMessage, status, stop } =
    useChat<ThreadMessage>({
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: () =>
          hasMcpServersRef.current === undefined
            ? {}
            : { hasMcpServers: hasMcpServersRef.current },
      }),
      onError: (error) => {
        const msg = generateDefaultErrorMessage(
          error.message ||
            "I'm sorry, I'm having trouble processing your request. Please try again later.",
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
            saveMessageToThread(normalizeThreadMessage(message)),
          ).catch((error) => {
            console.error("Failed to save assistant message:", error);
          });
        }
      },
    });

  const isLoading = status === "submitted" || status === "streaming";
  const visibleMessages = useMemo(
    () => (loadedThreadIdRef.current === threadId ? messages : []),
    [threadId, messages],
  );
  // Token context calculation disabled for performance.
  const totalTokenUsage: ThreadMessageMetadata | undefined = undefined;
  /*
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
  */

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
    if (!isNewThread) return;

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const sharedDraft = sessionStorage.getItem("shared-draft");
      const draft = sharedDraft ?? url.searchParams.get("draft");

      if (draft !== null) {
        writeNewThreadDraft(draft);
        sessionStorage.removeItem("shared-draft");
        url.searchParams.delete("draft");
        window.history.replaceState(
          {},
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
    }

    setInput(readNewThreadDraft());
  }, [isNewThread]);

  const handleInputChangeWithClearSuggestions = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const nextInput = e.target.value;
    setInput(nextInput);

    if (isNewThread) {
      writeNewThreadDraft(nextInput);
    }
  };

  const handleSuggestionClick = async (suggestion: string) => {
    writeNewThreadDraft("");
    const msg = generateDefaultUserMessage(suggestion);
    enqueueThreadWrite(() =>
      persistUserMessageBeforeSend(suggestion, msg),
    ).catch((error) => {
      console.error("Failed to save user message:", error);
    });
    sendMessage({ text: suggestion }, await getChatRequestOptions()).catch(
      (error) => {
        console.error("Failed to send message:", error);
      },
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

  const generateTitleForNewThread = async (firstMessage: string) => {
    try {
      const authToken = await auth.currentUser?.getIdToken();
      if (!authToken) return;

      const response = await fetch("/api/chat/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, firstMessage, authToken }),
      });

      if (!response.ok) {
        throw new Error(`Title generation failed with ${response.status}`);
      }

      const data = (await response.json()) as GeneratedTitleResponse;
      if (!data.title || data.skipped) return;

      if (!uid) return;
      queryClient.setQueryData(
        threadKeys.detail(uid, threadId),
        (oldData: Thread | null | undefined) =>
          oldData
            ? { ...oldData, title: data.title!, titleSource: "generated" }
            : oldData,
      );
      queryClient.setQueryData<ThreadsInfiniteData>(
        threadKeys.all(uid),
        (oldData) => updateThreadTitleInList(oldData, threadId, data.title!),
      );
    } catch (error) {
      console.error("Failed to generate chat title:", error);
    }
  };

  const persistUserMessageBeforeSend = async (
    title: string,
    message: ThreadMessage,
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

        void generateTitleForNewThread(title);
        setIsNewThread(false);
      } finally {
        setIsCreatingThread(false);
      }
      return;
    }

    await saveMessageToThread(message);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!threadId || !uid || isNewThread || status !== "ready") return;
    if (visibleMessages.length === 0) return;
    if (composioAuthResumeStartedRef.current) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("composioAuth") !== "complete") return;

    const storageKey = `composio-auth-resumed:${threadId}`;
    if (sessionStorage.getItem(storageKey)) {
      url.searchParams.delete("composioAuth");
      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
      return;
    }

    composioAuthResumeStartedRef.current = true;
    sessionStorage.setItem(storageKey, "true");

    const resumeAfterComposioAuth = async () => {
      try {
        url.searchParams.delete("composioAuth");
        url.searchParams.delete("status");
        url.searchParams.delete("connected_account_id");
        window.history.replaceState(
          {},
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );

        const text = "Connected. Please continue with my previous request.";
        const message = generateDefaultUserMessage(text);

        enqueueThreadWrite(() =>
          persistUserMessageBeforeSend(text, message),
        ).catch((error) => {
          console.error("Failed to save Composio resume message:", error);
        });

        await sendMessage({ text }, await getChatRequestOptions());

        void queryClient.invalidateQueries({
          queryKey: connectionKeys.list(uid),
        });
        void refetchConnections();
      } catch (error) {
        console.error("Failed to resume chat after Composio auth:", error);
        sessionStorage.removeItem(storageKey);
        composioAuthResumeStartedRef.current = false;
      }
    };

    void resumeAfterComposioAuth();
  }, [
    isNewThread,
    queryClient,
    refetchConnections,
    sendMessage,
    status,
    threadId,
    uid,
    visibleMessages.length,
  ]);

  const handleStop = () => {
    stop();
  };

  const handleModelChange = (model: AIModel) => {
    setSelectedModel(model);
  };

  const submitMessage = async (
    text: string,
    submittedAttachments: Attachment[],
  ) => {
    const submittedTitle =
      text || submittedAttachments[0]?.name || "File attachment";
    const msg = generateDefaultUserMessage(text, submittedAttachments);

    enqueueThreadWrite(() =>
      persistUserMessageBeforeSend(submittedTitle, msg),
    ).catch((error) => {
      console.error("Failed to save user message:", error);
    });

    await sendMessage(
      {
        text,
        files: attachmentsToFileParts(submittedAttachments),
      },
      await getChatRequestOptions(),
    );
  };
  const submitMessageRef = useRef(submitMessage);
  submitMessageRef.current = submitMessage;

  // Auto-send shared links: /chat?prompt=...
  useEffect(() => {
    if (
      !isNewThread ||
      !uid ||
      status !== "ready" ||
      promptFromUrlSentRef.current
    ) {
      return;
    }
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const sharedPrompt = sessionStorage.getItem("shared-prompt");
    const prompt = (sharedPrompt ?? url.searchParams.get("prompt"))
      ?.replace(/\+/g, " ")
      .trim();
    if (!prompt) return;
    sessionStorage.removeItem("shared-prompt");

    // Survive Chat remounts (e.g. settings → back to /chat) when Next restores ?prompt
    // after history.replaceState cleared it from the address bar only.
    const storageKey = promptFromUrlStorageKey(prompt);
    const alreadySent =
      consumedPromptFromUrl === prompt ||
      sessionStorage.getItem(storageKey) === "true";

    if (alreadySent) {
      clearPromptFromUrl();
      return;
    }

    promptFromUrlSentRef.current = true;
    consumedPromptFromUrl = prompt;
    sessionStorage.setItem(storageKey, "true");
    clearPromptFromUrl();
    writeNewThreadDraft("");
    setInput("");

    void submitMessageRef.current(prompt, []).catch((error) => {
      console.error("Failed to auto-send prompt from URL:", error);
      promptFromUrlSentRef.current = false;
      consumedPromptFromUrl = undefined;
      sessionStorage.removeItem(storageKey);
    });
  }, [isNewThread, status, uid]);

  const sendQueuedMessage = useCallback(
    async (queuedMessageId: string) => {
      const queuedMessage = queuedMessages.find(
        (message) => message.id === queuedMessageId,
      );

      if (!queuedMessage || isSendingQueuedMessage) return;

      setIsSendingQueuedMessage(true);
      setQueuedMessages((messages) =>
        messages.filter((message) => message.id !== queuedMessageId),
      );

      try {
        await submitMessage(queuedMessage.text, queuedMessage.attachments);
      } catch (error) {
        console.error("Failed to send queued message:", error);
        setQueuedMessages((messages) => [queuedMessage, ...messages]);
      } finally {
        setIsSendingQueuedMessage(false);
      }
    },
    [isSendingQueuedMessage, queuedMessages, submitMessage],
  );

  useEffect(() => {
    if (
      status !== "ready" ||
      isCreatingThread ||
      queuedMessages.length === 0 ||
      isSendingQueuedMessage
    ) {
      return;
    }

    const queuedMessageId =
      pendingQueuedMessageIdRef.current ?? queuedMessages[0].id;
    pendingQueuedMessageIdRef.current = null;
    void sendQueuedMessage(queuedMessageId);
  }, [
    isCreatingThread,
    isSendingQueuedMessage,
    queuedMessages,
    sendQueuedMessage,
    status,
  ]);

  const handleQueuedMessageChange = (queuedMessageId: string, text: string) => {
    setQueuedMessages((messages) =>
      messages.map((message) =>
        message.id === queuedMessageId ? { ...message, text } : message,
      ),
    );
  };

  const handleQueuedMessageDelete = (queuedMessageId: string) => {
    if (pendingQueuedMessageIdRef.current === queuedMessageId) {
      pendingQueuedMessageIdRef.current = null;
    }

    setQueuedMessages((messages) =>
      messages.filter((message) => message.id !== queuedMessageId),
    );
  };

  const handleQueuedMessageSendNow = (queuedMessageId: string) => {
    pendingQueuedMessageIdRef.current = queuedMessageId;

    if (isLoading) {
      stop();
      return;
    }

    void sendQueuedMessage(queuedMessageId);
  };

  const prepareSubmittedMessage = () => {
    const submittedInput = input.trim();
    const submittedAttachments = attachments;
    if (!submittedInput && submittedAttachments.length === 0) return null;

    setInput("");
    if (isNewThread) {
      writeNewThreadDraft("");
    }
    setAttachments([]);

    return {
      id: crypto.randomUUID(),
      text: submittedInput,
      attachments: submittedAttachments,
    } satisfies QueuedChatMessage;
  };

  const handleChatSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const submittedMessage = prepareSubmittedMessage();
    if (!submittedMessage) return;

    if (isLoading || isCreatingThread) {
      setQueuedMessages((messages) => [...messages, submittedMessage]);
      return;
    }

    submitMessage(submittedMessage.text, submittedMessage.attachments).catch(
      (error) => {
        console.error("Failed to send message:", error);
      },
    );
  };

  const handleInstantChatSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();

    const submittedMessage = prepareSubmittedMessage();
    if (!submittedMessage) return;

    if (isLoading || isCreatingThread) {
      pendingQueuedMessageIdRef.current = submittedMessage.id;
      setQueuedMessages((messages) => [submittedMessage, ...messages]);
      if (isLoading) {
        stop();
      }
      return;
    }

    submitMessage(submittedMessage.text, submittedMessage.attachments).catch(
      (error) => {
        console.error("Failed to send message:", error);
      },
    );
  };

  async function getChatRequestOptions(): Promise<ChatRequestOptions> {
    return {
      body: {
        modelId: selectedModel.id,
        authToken: await auth.currentUser?.getIdToken(),
        threadId,
        ...(hasMcpServersRef.current !== undefined
          ? { hasMcpServers: hasMcpServersRef.current }
          : {}),
      },
    };
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* Chat Content Area */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {visibleMessages.length === 0 && isNewThread ? (
          <HomeSuggestions
            onSuggestionClick={async (suggestion) => {
              await handleSuggestionClick(suggestion);
            }}
          />
        ) : (
          <MessageList
            key={threadId}
            threadId={threadId}
            messages={visibleMessages}
            status={status}
            toolApps={toolApps}
            mcpServers={mcpServers}
          />
        )}
      </div>

      {/* Chat Input */}
      <ChatInput
        input={input}
        autoFocus={isNewThread}
        tokenUsage={totalTokenUsage}
        isLoading={isLoading || isCreatingThread}
        handleInputChange={handleInputChangeWithClearSuggestions}
        handleSubmit={handleChatSubmit}
        handleInstantSubmit={handleInstantChatSubmit}
        onStop={handleStop}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        attachments={attachments}
        setAttachments={setAttachments}
        queuedMessages={queuedMessages}
        onQueuedMessageChange={handleQueuedMessageChange}
        onQueuedMessageSendNow={handleQueuedMessageSendNow}
        onQueuedMessageDelete={handleQueuedMessageDelete}
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
  splitwise: "Review Splitwise expenses and balances",
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
  youtube: "Analyze my YouTube channel and videos",
  elevenlabs: "Create or manage ElevenLabs voice assets",
  vapi: "Review my Vapi assistants and calls",
  cats: "Find cat images or breed facts",
  fal_ai: "Run a Fal.ai media generation task",
  todoist: "Organize my Todoist tasks",
  metaads: "Review Meta Ads performance",
  googleads: "Review Google Ads performance",
  reddit: "Find and summarize Reddit discussions",
  facebook: "Review Facebook pages and activity",
  linkedin: "Draft and review LinkedIn content",
  ahrefs: "Analyze SEO data in Ahrefs",
  firecrawl: "Scrape a website and extract clean content",
  gemini: "Use Gemini for a generation task",
  composio_search: "Search the web",
  browser_tool: "Browse a website and extract what matters",
};

const INSTAGRAM_HOME_PROMPTS: PromptSuggestion[] = [
  {
    label: "Review recent Instagram activity",
    appName: "Instagram",
    logo: "https://logos.composio.dev/api/instagram",
  },
  {
    label: "Audit my Instagram profile",
    appName: "Instagram",
    logo: "https://logos.composio.dev/api/instagram",
  },
  {
    label: "Generate a new reel idea based on my last working reel",
    appName: "Instagram",
    logo: "https://logos.composio.dev/api/instagram",
  },
  {
    label:
      "Generate sub topics that I could create based on the content that is working",
    appName: "Instagram",
    logo: "https://logos.composio.dev/api/instagram",
  },
];

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
  const userName = user?.name?.trim().split(" ")[0];
  const [activePrompt, setActivePrompt] = useState(0);
  const [greeting, setGreeting] = useState("Hi");
  const shouldReduceMotion = useReducedMotion();
  const { data: toolkits = [], isLoading: areConnectionsLoading } =
    useConnections(uid);
  const connectedApps = useMemo(
    () =>
      toolkits.filter(
        (toolkit) => toolkit.isConnected && !toolkit.isNoAuth,
      ),
    [toolkits],
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
      if (app.slug === "instagram") return [];

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
    return [...INSTAGRAM_HOME_PROMPTS, ...appPrompts, ...genericPrompts].slice(
      0,
      8,
    );
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
      className="flex h-full min-h-0 w-full min-w-0 flex-col items-center justify-start overflow-y-auto px-4 pb-4 pt-6 text-center sm:justify-center sm:px-6 sm:py-10"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div className="w-full min-w-0 max-w-4xl space-y-5 sm:space-y-7">
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
          <h1 className="text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
            {greeting}
            {userName ? `, ${userName}` : ""}
          </h1>
        </div>

        <div className="flex w-full min-w-0 flex-col items-center justify-start gap-4 sm:min-h-[280px] sm:gap-7">
          {arePromptsReady && (
            <>
              <motion.div
                className="mx-auto flex w-full min-w-0 max-w-3xl flex-wrap justify-center gap-3 sm:gap-3"
                variants={pillContainerVariants}
                initial={shouldReduceMotion ? false : "hidden"}
                animate="visible"
              >
                {suggestions.map((suggestion) => (
                  <motion.button
                    key={suggestion.label}
                    className="inline-flex max-w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-secondary/70 px-4 py-2.5 text-center text-sm text-muted-foreground transition-all hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:justify-start sm:px-5 sm:py-3 sm:text-left sm:text-base"
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
                        className="h-5 w-5 shrink-0 rounded-xs bg-background bg-[length:14px_14px] bg-center bg-no-repeat"
                        style={{ backgroundImage: `url(${suggestion.logo})` }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="min-w-0 truncate text-center sm:text-left">
                      {suggestion.label}
                    </span>
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
