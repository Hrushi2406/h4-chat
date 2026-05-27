"use client";

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import {
  memo,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "framer-motion";
import { TextShimmer } from "@/components/ui/text-shimmer";
import clsx from "clsx";
import { getToolDisplayName } from "@/lib/types/tool-mappings";
import type { BrowserMcpServer } from "@/lib/mcp-browser";
import {
  getMessageAttachments,
  getMessageContent,
  ThreadMessage,
  ThreadMessageMetadata,
} from "@/lib/types/thread";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileText,
  ChevronDown,
  ChevronRight,
  Copy,
  ListTree,
  Zap,
} from "lucide-react";
import CodeBlock from "./code-block";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

type ToolAppIcon = {
  slug: string;
  logo?: string;
};

const markdownRemarkPlugins = [remarkGfm, remarkToc];
const scrollBottomThreshold = 120;
const streamingRenderThrottleMs = 80;
const virtualMessageGap = 16;

const markdownComponents = {
  code: ({ children, className }) => {
    const match = /language-(\w+)/.exec(className || "");

    if (!match) {
      return <code className={className}>{children}</code>;
    }

    return (
      <CodeBlock
        value={String(children).replace(/\n$/, "")}
        language={match[1]}
      />
    );
  },
  pre: ({ children }) => (
    <div className="max-w-full overflow-x-auto rounded-lg bg-secondary p-2">
      {children}
    </div>
  ),
  a: ({ href, children }) => (
    isImageUrl(href) ? (
      <InlineImage src={href} alt={getNodeText(children) || "Generated image"} />
    ) : (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-primary/80 transition-colors"
      >
        {children}
      </a>
    )
  ),
  img: ({ src, alt }) => (
    <InlineImage
      src={typeof src === "string" ? src : undefined}
      alt={alt || "Generated image"}
    />
  ),
} satisfies Components;

interface MessageListProps {
  threadId: string;
  messages: ThreadMessage[];
  status?: "submitted" | "streaming" | "ready" | "error";
  toolApps?: ToolAppIcon[];
  mcpServers?: BrowserMcpServer[];
}

export const MessageList = memo(function MessageList({
  threadId,
  messages,
  status = "ready",
  toolApps = [],
  mcpServers = [],
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousThreadIdRef = useRef(threadId);
  const previousMessageSnapshotRef = useRef(getMessageSnapshot(messages));
  const previousStatusRef = useRef(status);
  const wasNearBottomRef = useRef(true);
  const pinToBottomUntilRef = useRef(0);
  const scheduledScrollRef = useRef<number | null>(null);
  const initialLoadScrollTimerRefs = useRef<number[]>([]);
  const suppressScrollButtonUntilRef = useRef(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const messageSnapshot = getMessageSnapshot(messages);
  const messageSnapshotKey = `${messageSnapshot.count}:${messageSnapshot.firstId ?? ""}:${
    messageSnapshot.lastId ?? ""
  }`;
  const mcpServerNames = useMemo(
    () =>
      Object.fromEntries(
        mcpServers.map((server) => [server.id.toLowerCase(), server.name]),
      ),
    [mcpServers],
  );

  // Show loading indicator only when status is "submitted" (before streaming starts)
  const showLoadingIndicator = status === "submitted";
  const loadingIndicatorIndex = messages.length;
  const bottomSpacerIndex = messages.length + (showLoadingIndicator ? 1 : 0);
  const rowCount = bottomSpacerIndex + 1;
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      if (index === bottomSpacerIndex) return 4;
      if (index === loadingIndicatorIndex && showLoadingIndicator) {
        return getActiveResponseEstimate();
      }

      const message = messages[index];
      if (message?.role === "assistant" && index === messages.length - 1) {
        return getActiveResponseEstimate();
      }

      return message?.role === "user" ? 96 : 180;
    },
    getItemKey: (index) => {
      if (index === bottomSpacerIndex) return "bottom-spacer";
      if (index === loadingIndicatorIndex && showLoadingIndicator) {
        return "loading-indicator";
      }

      return messages[index]?.id ?? index;
    },
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useLayoutEffect(() => {
    const previousSnapshot = previousMessageSnapshotRef.current;
    const hasChangedThread = previousThreadIdRef.current !== threadId;
    const hasLoadedThreadMessages =
      previousSnapshot.count === 0 && messageSnapshot.count > 0;
    const hasSwitchedThreads =
      messageSnapshot.count > 0 &&
      previousSnapshot.count > 0 &&
      (messageSnapshot.firstId !== previousSnapshot.firstId ||
        (messageSnapshot.count <= previousSnapshot.count &&
          messageSnapshot.lastId !== previousSnapshot.lastId));

    if (!hasChangedThread && !hasLoadedThreadMessages && !hasSwitchedThreads) {
      return;
    }

    startPinnedBottomScroll();

    return () => {
      stopPinnedBottomScroll();
    };
  }, [threadId, messageSnapshotKey]);

  useLayoutEffect(() => {
    const contentElement = contentRef.current;

    if (!contentElement || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (Date.now() <= pinToBottomUntilRef.current) {
        scrollToBottom("auto");
      }

      updateScrollState();
    });

    resizeObserver.observe(contentElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const currentSnapshot = getMessageSnapshot(messages);
    const previousSnapshot = previousMessageSnapshotRef.current;
    const previousStatus = previousStatusRef.current;
    const hasChangedThread = previousThreadIdRef.current !== threadId;
    const hasNewMessage = currentSnapshot.count > previousSnapshot.count;
    const hasNewStreamingAssistantMessage =
      status === "streaming" &&
      hasNewMessage &&
      messages.at(-1)?.role === "assistant";
    const hasStartedResponse =
      previousStatus === "submitted" && status === "streaming";
    const hasLoadedThreadMessages =
      previousSnapshot.count === 0 && currentSnapshot.count > 0;
    const isSameThread =
      currentSnapshot.count === 0 ||
      previousSnapshot.count === 0 ||
      currentSnapshot.firstId === previousSnapshot.firstId;
    const hasSwitchedThreads =
      currentSnapshot.count > 0 &&
      previousSnapshot.count > 0 &&
      (currentSnapshot.firstId !== previousSnapshot.firstId ||
        (currentSnapshot.count <= previousSnapshot.count &&
          currentSnapshot.lastId !== previousSnapshot.lastId));
    if (hasChangedThread || hasSwitchedThreads || hasLoadedThreadMessages) {
      wasNearBottomRef.current = true;
      startPinnedBottomScroll();
    } else if (hasStartedResponse) {
      stopPinnedBottomScroll();
    } else if (
      hasNewMessage &&
      !hasNewStreamingAssistantMessage &&
      (wasNearBottomRef.current || !isSameThread)
    ) {
      scrollToBottom();
    }

    previousStatusRef.current = status;
    previousThreadIdRef.current = threadId;
    previousMessageSnapshotRef.current = currentSnapshot;
  }, [threadId, messages, status]);

  useEffect(() => {
    if (showLoadingIndicator && wasNearBottomRef.current) {
      startPinnedBottomScroll();
    }
  }, [showLoadingIndicator]);

  const updateNearBottom = () => {
    updateScrollState();
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const scrollElement = scrollContainerRef.current;

    if (!scrollElement) {
      return;
    }

    scrollElement.scrollTo({
      top: scrollElement.scrollHeight,
      behavior,
    });
    suppressScrollButtonUntilRef.current =
      behavior === "smooth" ? Date.now() + 700 : 0;
    setShowScrollToBottom(false);
    wasNearBottomRef.current = true;
  };

  const updateScrollState = () => {
    const scrollElement = scrollContainerRef.current;
    const nearBottom = isNearBottom(scrollElement);
    const isProgrammaticScroll = Date.now() <= suppressScrollButtonUntilRef.current;

    wasNearBottomRef.current = nearBottom;
    if (nearBottom) {
      suppressScrollButtonUntilRef.current = 0;
    }

    setShowScrollToBottom(
      Boolean(
        scrollElement &&
          !nearBottom &&
          !isProgrammaticScroll &&
          hasScrollableOverflow(scrollElement),
      ),
    );
  };

  const startPinnedBottomScroll = () => {
    wasNearBottomRef.current = true;
    pinToBottomUntilRef.current = Date.now() + 750;
    scrollToBottom("auto");
    schedulePinnedBottomScroll(3);
    schedulePinnedBottomTimer(120);
    schedulePinnedBottomTimer(500);
  };

  const schedulePinnedBottomScroll = (remainingFrames: number) => {
    if (scheduledScrollRef.current !== null || remainingFrames <= 0) {
      return;
    }

    scheduledScrollRef.current = requestAnimationFrame(() => {
      scheduledScrollRef.current = null;
      scrollToBottom("auto");

      if (Date.now() <= pinToBottomUntilRef.current) {
        schedulePinnedBottomScroll(remainingFrames - 1);
      }
    });
  };

  const schedulePinnedBottomTimer = (delay: number) => {
    const timer = window.setTimeout(() => {
      scrollToBottom("auto");
      initialLoadScrollTimerRefs.current =
        initialLoadScrollTimerRefs.current.filter((item) => item !== timer);
    }, delay);
    initialLoadScrollTimerRefs.current.push(timer);
  };

  const stopPinnedBottomScroll = () => {
    pinToBottomUntilRef.current = 0;

    if (scheduledScrollRef.current !== null) {
      cancelAnimationFrame(scheduledScrollRef.current);
      scheduledScrollRef.current = null;
    }

    initialLoadScrollTimerRefs.current.forEach((timer) => {
      window.clearTimeout(timer);
    });
    initialLoadScrollTimerRefs.current = [];
  };

  return (
    <div className="relative h-full min-h-0 flex-1">
      <div
        ref={scrollContainerRef}
        onScroll={updateNearBottom}
        className="h-full min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] px-3 pt-3 pb-4 sm:p-4"
      >
        <div ref={contentRef} className="mx-auto w-full min-w-0 max-w-4xl">
          <div
            className="relative min-w-0 w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map((virtualItem) => {
              const index = virtualItem.index;
              const message = messages[index];
              const isLastAssistantMessage =
                message?.role === "assistant" && index === messages.length - 1;
              const isStreaming =
                isLastAssistantMessage &&
                (status === "streaming" || status === "submitted");

              return (
                <div
                  key={virtualItem.key}
                  data-index={index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full min-w-0"
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                    paddingBottom:
                      index === bottomSpacerIndex ? 0 : virtualMessageGap,
                  }}
                >
                  {message ? (
                    isStreaming ? (
                      <ActiveMessageItem
                        message={message}
                        toolApps={toolApps}
                        mcpServerNames={mcpServerNames}
                        isLastAssistantMessage={isLastAssistantMessage}
                        isStreaming={isStreaming}
                      />
                    ) : (
                      <CompletedMessageItem
                        message={message}
                        toolApps={toolApps}
                        mcpServerNames={mcpServerNames}
                        isLastAssistantMessage={isLastAssistantMessage}
                      />
                    )
                  ) : index === loadingIndicatorIndex && showLoadingIndicator ? (
                    <LoadingMessage />
                  ) : (
                    <div className="h-1" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {showScrollToBottom && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-x-3 bottom-3 z-20 mx-auto flex max-w-4xl justify-end sm:inset-x-4 sm:bottom-4"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Scroll to latest message"
                  onClick={() => scrollToBottom()}
                  className="pointer-events-auto inline-flex size-9 items-center justify-center rounded-full border border-border/80 bg-background/85 text-muted-foreground shadow-lg shadow-black/10 backdrop-blur-md transition hover:border-primary/20 hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 dark:shadow-black/30"
                >
                  <ArrowDown className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Scroll to latest</TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const CompletedMessageItem = memo(
  ({
    message,
    toolApps,
    mcpServerNames,
    isLastAssistantMessage,
  }: {
    message: ThreadMessage;
    toolApps: ToolAppIcon[];
    mcpServerNames: Record<string, string>;
    isLastAssistantMessage: boolean;
  }) => (
    <MessageItemContent
      message={message}
      toolApps={toolApps}
      mcpServerNames={mcpServerNames}
      isLastAssistantMessage={isLastAssistantMessage}
      isStreaming={false}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.message === nextProps.message &&
    prevProps.toolApps === nextProps.toolApps &&
    prevProps.mcpServerNames === nextProps.mcpServerNames &&
    prevProps.isLastAssistantMessage === nextProps.isLastAssistantMessage,
);

CompletedMessageItem.displayName = "CompletedMessageItem";

const ActiveMessageItem = ({
  message,
  toolApps,
  mcpServerNames,
  isLastAssistantMessage,
  isStreaming,
}: {
  message: ThreadMessage;
  toolApps: ToolAppIcon[];
  mcpServerNames: Record<string, string>;
  isLastAssistantMessage: boolean;
  isStreaming: boolean;
}) => {
  const renderedMessage = useThrottledValue(
    message,
    streamingRenderThrottleMs,
    isStreaming,
  );

  return (
    <MessageItemContent
      message={renderedMessage}
      toolApps={toolApps}
      mcpServerNames={mcpServerNames}
      isLastAssistantMessage={isLastAssistantMessage}
      isStreaming={isStreaming}
    />
  );
};

const LoadingMessage = () => (
  <motion.div
    initial={{
      opacity: 0,
      y: 10,
    }}
    animate={{
      opacity: 1,
      y: 0,
    }}
    exit={{
      opacity: 0,
      y: -10,
    }}
    transition={{
      duration: 0.2,
      ease: "easeOut",
    }}
    className="flex min-w-0 w-full justify-start"
  >
    <div
      className={`min-w-0 w-full max-w-full md:w-auto md:max-w-[75%] ${heightClass} rounded-lg py-3 text-foreground`}
    >
      <TextShimmer
        className="text-sm md:text-base leading-loose [--base-color:theme(colors.blue.600)] [--base-gradient-color:theme(colors.blue.200)] dark:[--base-color:theme(colors.blue.700)] dark:[--base-gradient-color:theme(colors.blue.400)]"
        duration={1.5}
        spread={1.5}
      >
        Generating response...
      </TextShimmer>
    </div>
  </motion.div>
);

const MessageItemContent = memo(
  ({
    message,
    toolApps,
    mcpServerNames,
    isLastAssistantMessage,
    isStreaming,
  }: {
    message: ThreadMessage;
    toolApps: ToolAppIcon[];
    mcpServerNames: Record<string, string>;
    isLastAssistantMessage: boolean;
    isStreaming: boolean;
  }) => {
    const content = useMemo(() => getMessageContent(message), [message]);
    const attachments = useMemo(
      () => getMessageAttachments(message),
      [message],
    );
    const shouldDockUserCopyButton =
      message.role === "user" && shouldDockCopyButton(content, attachments.length);

    return (
      <div
        className={clsx(
          "group/message min-w-0",
          !isLastAssistantMessage &&
            "[content-visibility:auto] [contain-intrinsic-size:0_160px]",
        )}
      >
        <div
          className={clsx(
            "flex min-w-0 w-full",
            message.role === "user"
              ? "items-end justify-end gap-1"
              : "justify-start",
          )}
        >
          {message.role === "user" && !shouldDockUserCopyButton && (
            <div className="opacity-100 md:opacity-0 md:transition-opacity md:group-hover/message:opacity-100 md:group-focus-within/message:opacity-100">
              <MessageCopyButton message={message} />
            </div>
          )}
          <div
            className={clsx(
              "min-w-0 leading-7",
              message.role === "user"
                ? "max-w-[min(100%,92%)] md:max-w-[75%]"
                : "w-full max-w-full md:w-auto md:max-w-[75%]",
              shouldDockUserCopyButton && "relative pb-2 pr-8",
              message.role === "user" &&
                attachments.length === 0 &&
                userMessageStyle(content),
              message.role === "assistant" && [
                "text-foreground rounded-lg pt-3 pb-1",
                isLastAssistantMessage && heightClass,
              ],
            )}
          >
            {message.role === "assistant" ? (
              <AssistantMessage
                message={message}
                toolApps={toolApps}
                mcpServerNames={mcpServerNames}
                isStreaming={isStreaming}
              />
            ) : (
              <UserMessage content={content} attachments={attachments} />
            )}
            {shouldDockUserCopyButton && (
              <MessageCopyButton
                message={message}
                className="absolute bottom-1 right-1 h-6 w-6 text-current/65 hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
              />
            )}
          </div>
        </div>
        {message.role === "assistant" && (
          <MessageMetadataRow message={message} showCopy={!isStreaming} />
        )}
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.message === nextProps.message &&
    prevProps.toolApps === nextProps.toolApps &&
    prevProps.mcpServerNames === nextProps.mcpServerNames &&
    prevProps.isLastAssistantMessage === nextProps.isLastAssistantMessage &&
    prevProps.isStreaming === nextProps.isStreaming,
);

MessageItemContent.displayName = "MessageItemContent";

const AssistantMessage = memo(
  ({
    message,
    toolApps,
    mcpServerNames,
    isStreaming,
  }: {
    message: ThreadMessage;
    toolApps: ToolAppIcon[];
    mcpServerNames: Record<string, string>;
    isStreaming: boolean;
  }) => {
    const reasoningPart = message.parts?.find(
      (part) => part.type === "reasoning",
    ) as { text?: string } | undefined;

    return (
      <>
        {reasoningPart?.text && (
          <ReasoningBlock text={reasoningPart.text} isStreaming={isStreaming} />
        )}
        {message.parts?.map((part, index) => {
          if (part.type === "reasoning") return null;

          if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
            return (
              <ToolPart
                key={index}
                part={part}
                toolApps={toolApps}
                mcpServerNames={mcpServerNames}
              />
            );
          }

          if (part.type === "text") {
            return <MarkdownPart key={index} text={part.text} />;
          }

          if (part.type === "file" && part.mediaType?.startsWith("image/")) {
            return (
              <InlineImage
                key={index}
                src={part.url}
                alt={part.filename || "Generated image"}
              />
            );
          }

          return null;
        })}
      </>
    );
  },
);

AssistantMessage.displayName = "AssistantMessage";

const ToolPart = memo(
  ({
    part,
    toolApps,
    mcpServerNames,
  }: {
    part: any;
    toolApps: ToolAppIcon[];
    mcpServerNames: Record<string, string>;
  }) => {
    const toolStatus = part.state;
    const toolName = part.toolName ?? part.type.replace(/^tool-/, "");
    const isCalling =
      toolStatus === "input-streaming" || toolStatus === "input-available";
    const isError = isToolErrorState(toolStatus);
    const toolError = getToolErrorText(part);
    const { displayName, Icon, tooltip, appSlugs, source, toolLabel } = getToolDisplayName(
      toolName,
      toolStatus,
      part,
      mcpServerNames,
    );
    const logos = getToolLogos(appSlugs, toolApps);
    const isMcp = source === "mcp";

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center gap-2 mr-2 text-sm rounded-full my-2 transition-all duration-300 ease-in-out ${
              isCalling
                ? "px-0 py-0"
                : isError
                  ? "px-3 py-1.5 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
                : "px-3 py-1.5 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
            }`}
          >
            {isCalling ? (
              <div
                key={`${toolName}-${toolStatus}-calling`}
                className="flex gap-2 items-center animate-in fade-in "
              >
                {isMcp ? (
                  <McpToolIcon isCalling />
                ) : (
                  <ToolIcon
                    Icon={Icon}
                    logos={logos}
                    className="text-blue-500 animate-bounce"
                  />
                )}
                <TextShimmer
                  className="text-sm md:text-base [--base-color:theme(colors.blue.600)] [--base-gradient-color:theme(colors.blue.200)] dark:[--base-color:theme(colors.blue.700)] dark:[--base-gradient-color:theme(colors.blue.400)]"
                  duration={1.5}
                  spread={1.5}
                >
                  {toolLabel ? `${displayName} / ${toolLabel}` : displayName}
                </TextShimmer>
              </div>
            ) : (
              <div
                key={`${toolName}-${toolStatus}`}
                className="flex items-center gap-2 text-sm md:text-sm"
              >
                {isMcp ? <McpToolIcon /> : <ToolIcon Icon={Icon} logos={logos} />}
                <span>{displayName}</span>
                {toolLabel && (
                  <span className="max-w-44 truncate rounded-sm bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-900 dark:bg-blue-900/70 dark:text-blue-100">
                    {toolLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-80 whitespace-pre-wrap text-left leading-relaxed"
        >
          {toolError ? `${tooltip}\nError: ${toolError}` : tooltip}
        </TooltipContent>
      </Tooltip>
    );
  },
);

ToolPart.displayName = "ToolPart";

const McpToolIcon = ({ isCalling = false }: { isCalling?: boolean }) => (
  <span
    className={clsx(
      "grid h-4 w-4 shrink-0 place-items-center rounded-sm bg-blue-600 text-white dark:bg-blue-500",
      isCalling && "animate-bounce",
    )}
    aria-hidden="true"
  >
    <Zap className="h-3 w-3" />
  </span>
);

const ToolIcon = ({
  Icon,
  logos,
  className,
}: {
  Icon: any;
  logos: string[];
  className?: string;
}) => {
  if (logos.length === 0) {
    return <Icon className={clsx("w-4 h-4", className)} />;
  }

  return (
    <span className={clsx("inline-flex -space-x-1", className)} aria-hidden="true">
      {logos.slice(0, 3).map((logo) => (
        <span
          key={logo}
          className="h-4 w-4 shrink-0 rounded-full bg-background bg-[length:12px_12px] bg-center bg-no-repeat ring-1 ring-background"
          style={{ backgroundImage: `url(${logo})` }}
        />
      ))}
    </span>
  );
};

const getToolLogos = (appSlugs: string[] = [], toolApps: ToolAppIcon[]) =>
  appSlugs
    .map((slug) => toolApps.find((app) => app.slug === slug)?.logo ?? getFallbackAppLogo(slug))
    .filter((logo): logo is string => !!logo);

const getFallbackAppLogo = (slug: string) => {
  if (!slug || slug === "composio" || slug === "sandbox") {
    return undefined;
  }

  return `https://logos.composio.dev/api/${encodeURIComponent(slug)}`;
};

const isToolErrorState = (status?: string) =>
  status === "output-error" || status === "error" || status === "failed";

const getToolErrorText = (part: Record<string, unknown>) => {
  const directError = asReadableText(part.error) ?? asReadableText(part.errorText);
  if (directError) {
    return directError;
  }

  if (part.output && typeof part.output === "object") {
    const output = part.output as Record<string, unknown>;
    return (
      asReadableText(output.message) ??
      asReadableText(output.error) ??
      asReadableText(output.details)
    );
  }

  if (part.result && typeof part.result === "object") {
    const result = part.result as Record<string, unknown>;
    return asReadableText(result.message) ?? asReadableText(result.error);
  }

  return undefined;
};

const asReadableText = (value: unknown) => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return undefined;
};

const MarkdownPart = memo(({ text }: { text: string }) => (
  <div className="min-w-0 w-full overflow-x-auto">
    <div className="break-words text-sm md:text-base prose prose-sm prose-neutral md:prose-base prose-headings:break-words prose-p:break-words max-w-none leading-loose prose-headings:text-foreground prose-p:text-[#364153] prose-strong:text-foreground prose-li:text-[#364153] prose-th:text-[#364153] prose-td:text-[#364153] prose-a:text-primary prose-code:break-all prose-code:text-foreground prose-pre:bg-secondary dark:prose-invert dark:prose-p:text-[#d1d5dc] dark:prose-li:text-[#d1d5dc] dark:prose-th:text-[#d1d5dc] dark:prose-td:text-[#d1d5dc]">
      <ReactMarkdown
        remarkPlugins={markdownRemarkPlugins}
        components={markdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  </div>
));

MarkdownPart.displayName = "MarkdownPart";

const InlineImage = ({
  src,
  alt,
}: {
  src?: string;
  alt: string;
}) => {
  if (!src) {
    return null;
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="not-prose my-3 block max-w-full"
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[520px] max-w-full rounded-lg border border-border bg-muted object-contain shadow-sm"
        loading="lazy"
      />
    </a>
  );
};

const imageExtensionPattern = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

const isImageUrl = (href?: string) => {
  if (!href) {
    return false;
  }

  if (href.startsWith("data:image/")) {
    return true;
  }

  try {
    const url = new URL(href);
    return imageExtensionPattern.test(decodeURIComponent(url.pathname));
  } catch {
    return imageExtensionPattern.test(href.split(/[?#]/)[0]);
  }
};

const getNodeText = (node: React.ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeText).join("");
  }

  return "";
};

const getAttachmentExtension = (name?: string) => {
  const extension = name?.split(".").pop();
  return extension ? extension.toUpperCase() : "FILE";
};

const isImageAttachment = (attachment: ReturnType<typeof getMessageAttachments>[number]) =>
  attachment.contentType?.startsWith("image/") ||
  /\.(gif|jpe?g|png|webp)$/i.test(attachment.name ?? "");

const UserMessage = memo(
  ({
    content,
    attachments,
  }: {
    content: string;
    attachments: ReturnType<typeof getMessageAttachments>;
  }) => (
    <div className="">
      {attachments.length > 0 && (
        <div
          className={`mb-3 flex justify-end ${
            attachments.length > 1 ? "flex-wrap gap-1" : ""
          }`}
        >
          {attachments.map((attachment, attachmentIndex) => {
            const isImage = isImageAttachment(attachment);

            return (
              <div
                key={`${attachment.url}-${attachmentIndex}`}
                className={`rounded-lg overflow-hidden border border-border ${
                  attachments.length > 1
                    ? "max-w-[48%] max-h-[100px] aspect-square bg-muted"
                    : "min-w-0 max-w-[min(200px,calc(100vw-3rem))]"
                }`}
              >
                {isImage ? (
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      src={attachment.url}
                      alt={attachment.name || "Attachment"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ) : (
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-full w-full min-h-[120px]"
                  >
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted p-2">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {getAttachmentExtension(attachment.name)}
                      </span>
                      <span className="mt-1 max-w-full truncate text-center text-xs text-primary transition-colors hover:text-primary/80">
                        {attachment.name || "Attached file"}
                      </span>
                    </div>
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div
        className={
          attachments.length > 0
            ? clsx(
                "max-w-max ml-auto text-right self-end justify-end",
                userMessageStyle(content),
              )
            : undefined
        }
      >
        <p className="break-words text-sm md:text-base whitespace-pre-wrap leading-loose">
          {content}
        </p>
      </div>
    </div>
  ),
);

UserMessage.displayName = "UserMessage";

const MessageCopyButton = ({
  message,
  className,
}: {
  message: ThreadMessage;
  className?: string;
}) => {
  const [hasCopied, setHasCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const copyText = useMemo(() => getCopyableMessageText(message), [message]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    if (!copyText) {
      toast.error("Nothing to copy");
      return;
    }

    const copied = await copyTextToClipboard(copyText);

    if (!copied) {
      toast.error("Copy failed. Please copy manually.");
      return;
    }

    setHasCopied(true);
    toast.success("Message copied");

    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }

    copyTimerRef.current = window.setTimeout(() => {
      setHasCopied(false);
      copyTimerRef.current = null;
    }, 1600);
  }, [copyText]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={clsx(
            "h-7 w-7 text-muted-foreground hover:text-foreground",
            className,
          )}
          onClick={handleCopy}
          disabled={!copyText}
          aria-label={hasCopied ? "Message copied" : "Copy message"}
        >
          {hasCopied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {hasCopied ? "Copied" : "Copy message"}
      </TooltipContent>
    </Tooltip>
  );
};

const copyTextToClipboard = async (text: string) => {
  if (typeof window === "undefined") {
    return false;
  }

  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Installed PWAs can still reject clipboard writes; keep a legacy path.
    }
  }

  return copyTextWithTextareaFallback(text);
};

const copyTextWithTextareaFallback = (text: string) => {
  if (typeof document === "undefined") {
    return false;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "-9999px";
  textArea.style.opacity = "0";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, textArea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
};

const getCopyableMessageText = (message: ThreadMessage) => {
  const content = getMessageContent(message).trim();
  if (content) {
    return content;
  }

  const attachments = getMessageAttachments(message)
    .map((attachment) => attachment.url)
    .filter(Boolean);

  return attachments.join("\n");
};

const useThrottledValue = <T,>(
  value: T,
  delayMs: number,
  enabled: boolean,
) => {
  const [throttledValue, setThrottledValue] = useState(value);
  const latestValueRef = useRef(value);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    latestValueRef.current = value;

    if (!enabled) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      setThrottledValue(value);
      return;
    }

    if (timerRef.current !== null) {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setThrottledValue(latestValueRef.current);
    }, delayMs);
  }, [delayMs, enabled, value]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return enabled ? throttledValue : value;
};

const ReasoningBlock = ({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) => {
  const [open, setOpen] = useState(false);

  const doneLabel = open ? "Hide reasoning" : "View reasoning";

  if (isStreaming) {
    return (
      <div className="mb-3">
        <TextShimmer
          className="text-sm md:text-base leading-loose [--base-color:theme(colors.blue.600)] [--base-gradient-color:theme(colors.blue.200)] dark:[--base-color:theme(colors.blue.700)] dark:[--base-gradient-color:theme(colors.blue.400)]"
          duration={1.5}
          spread={1.5}
        >
          Thinking...
        </TextShimmer>
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-col items-start gap-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors whitespace-nowrap"
      >
        <ListTree className="w-4 h-4 shrink-0" />
        <span>{doneLabel}</span>
        {open ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
      {open && (
        <div className="max-w-full rounded-2xl border border-border/60 bg-muted/20 px-3 py-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap sm:max-w-prose sm:px-4">
          {text}
        </div>
      )}
    </div>
  );
};

const heightClass = `min-h-[calc(100dvh-19rem)] md:min-h-[calc(100dvh-20rem)]`;
const getActiveResponseEstimate = () => {
  if (typeof window === "undefined") return 480;

  const offset = window.matchMedia("(min-width: 768px)").matches ? 320 : 304;
  return Math.max(220, window.innerHeight - offset);
};

const isNearBottom = (element: HTMLElement | null) => {
  if (!element) return true;

  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    scrollBottomThreshold
  );
};

const hasScrollableOverflow = (element: HTMLElement) =>
  element.scrollHeight - element.clientHeight > scrollBottomThreshold;

const getMessageSnapshot = (messages: ThreadMessage[]) => ({
  count: messages.length,
  firstId: messages[0]?.id,
  lastId: messages.at(-1)?.id,
  lastContentLength: messages.at(-1)
    ? getRenderableMessageLength(messages.at(-1)!)
    : 0,
});

const getRenderableMessageLength = (message: ThreadMessage) => {
  const contentLength = getMessageContent(message).length;
  const reasoningLength =
    message.parts?.reduce((length, part) => {
      if (part.type === "reasoning" && "text" in part) {
        return length + (part.text?.length ?? 0);
      }

      return length;
    }, 0) ?? 0;

  return contentLength + reasoningLength;
};

const MessageMetadataRow = ({
  message,
  showCopy,
}: {
  message: ThreadMessage;
  showCopy: boolean;
}) => (
  <div className="flex items-center justify-start gap-1 text-muted-foreground/70">
    <MessageTokenUsage message={message} />
    {showCopy && <MessageCopyButton message={message} />}
  </div>
);

const MessageTokenUsage = ({ message }: { message: ThreadMessage }) => {
  const metadata = message.metadata;
  const inputTokens = metadata?.inputTokens ?? 0;
  const outputTokens = metadata?.outputTokens ?? 0;
  const totalTokens = metadata?.totalTokens ?? inputTokens + outputTokens;

  if (totalTokens === 0) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 rounded-full px-1.5 py-1 text-[11px] leading-none tabular-nums">
          <span>{formatTokenCount(totalTokens)} tokens</span>
          <span
            className="inline-flex items-center gap-0.5"
            aria-label={`${formatTokenCount(inputTokens)} input tokens`}
          >
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
            {formatTokenCount(inputTokens)}
          </span>
          <span
            className="inline-flex items-center gap-0.5"
            aria-label={`${formatTokenCount(outputTokens)} output tokens`}
          >
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
            {formatTokenCount(outputTokens)}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{formatTokenUsage(metadata)}</TooltipContent>
    </Tooltip>
  );
};

const formatTokenUsage = (metadata?: ThreadMessageMetadata) => {
  const inputTokens = metadata?.inputTokens ?? 0;
  const outputTokens = metadata?.outputTokens ?? 0;

  return `${formatTokenCount(inputTokens)} input + ${formatTokenCount(
    outputTokens,
  )} output tokens`;
};

const formatTokenCount = (tokenCount: number) => {
  if (tokenCount >= 1_000) {
    return `${Math.round(tokenCount / 1_000)}K`;
  }

  return tokenCount.toString();
};

const userMessageStyle = (content: string) => {
  return clsx(
    "bg-secondary text-secondary-foreground px-3 md:px-4 py-1 md:py-1.5",
    content.length <= 50 ? "rounded-full" : "rounded-2xl",
  );
};

const shouldDockCopyButton = (content: string, attachmentCount: number) =>
  attachmentCount > 0 || content.includes("\n") || content.length > 50;
