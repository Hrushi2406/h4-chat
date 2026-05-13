"use client";

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import rehypeRaw from "rehype-raw";
import { memo, useRef, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
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
  FileText,
  ChevronDown,
  ChevronRight,
  ListTree,
  Zap,
} from "lucide-react";
import CodeBlock from "./code-block";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ToolAppIcon = {
  slug: string;
  logo?: string;
};

const markdownRemarkPlugins = [remarkGfm, remarkToc];
const markdownRehypePlugins = [rehypeRaw];
const scrollBottomThreshold = 120;

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
    <div className="bg-secondary p-2 rounded-lg">{children}</div>
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousThreadIdRef = useRef(threadId);
  const previousMessageSnapshotRef = useRef(getMessageSnapshot(messages));
  const wasNearBottomRef = useRef(true);
  const mcpServerNames = useMemo(
    () =>
      Object.fromEntries(
        mcpServers.map((server) => [server.id.toLowerCase(), server.name]),
      ),
    [mcpServers],
  );

  // Show loading indicator only when status is "submitted" (before streaming starts)
  const showLoadingIndicator = status === "submitted";

  useEffect(() => {
    const currentSnapshot = getMessageSnapshot(messages);
    const previousSnapshot = previousMessageSnapshotRef.current;
    const hasChangedThread = previousThreadIdRef.current !== threadId;
    const hasNewMessage = currentSnapshot.count > previousSnapshot.count;
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
    if (hasChangedThread || hasSwitchedThreads) {
      wasNearBottomRef.current = true;
      requestAnimationFrame(() => scrollToBottom("auto"));
    } else if (hasNewMessage && (wasNearBottomRef.current || !isSameThread)) {
      scrollToBottom();
    }

    previousThreadIdRef.current = threadId;
    previousMessageSnapshotRef.current = currentSnapshot;
  }, [threadId, messages]);

  useEffect(() => {
    if (showLoadingIndicator && wasNearBottomRef.current) {
      scrollToBottom();
    }
  }, [showLoadingIndicator]);

  useEffect(() => {
    const scrollElement = getScrollElement();

    scrollElement?.addEventListener("scroll", updateNearBottom, {
      passive: true,
    });

    return () => {
      scrollElement?.removeEventListener("scroll", updateNearBottom);
    };
  }, [messages.length]);

  const updateNearBottom = () => {
    wasNearBottomRef.current = isNearBottom(getScrollElement());
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const scrollElement = getScrollElement();

    if (scrollElement) {
      scrollElement.scrollTo({
        top: scrollElement.scrollHeight,
        behavior,
      });
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior,
      block: "end",
    });
  };

  const getScrollElement = () => {
    let element = messagesEndRef.current?.parentElement ?? null;

    while (element) {
      const { overflowY } = window.getComputedStyle(element);
      const canScroll = /(auto|scroll|overlay)/.test(overflowY);

      if (canScroll && element.scrollHeight > element.clientHeight) {
        return element;
      }

      element = element.parentElement;
    }

    return scrollContainerRef.current;
  };

  return (
    <div
      ref={scrollContainerRef}
      onScroll={updateNearBottom}
      className="flex-1 overflow-y-auto p-4"
    >
      <div className="space-y-3 md:space-y-4 max-w-4xl mx-auto">
        {messages.map((message, index) => {
          const isLastAssistantMessage =
            message.role === "assistant" && index === messages.length - 1;

          return (
            <MessageItem
              key={message.id}
              message={message}
              toolApps={toolApps}
              mcpServerNames={mcpServerNames}
              isLastAssistantMessage={isLastAssistantMessage}
              isStreaming={
                isLastAssistantMessage &&
                (status === "streaming" || status === "submitted")
              }
            />
          );
        })}

        {/* Loading indicator with TextShimmer - only show when status is "submitted" */}
        {showLoadingIndicator && (
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
            className="flex justify-start "
          >
            <div
              className={`max-w-[75%] ${heightClass} py-3 text-foreground rounded-lg`}
            >
              <TextShimmer
                className="text-sm md:text-base leading-loose  [--base-color:theme(colors.blue.600)] [--base-gradient-color:theme(colors.blue.200)] dark:[--base-color:theme(colors.blue.700)] dark:[--base-gradient-color:theme(colors.blue.400)]"
                duration={1.5}
                spread={1.5}
              >
                Generating response...
              </TextShimmer>
            </div>
          </motion.div>
        )}

        {/* Invisible element to scroll to */}
        <div ref={messagesEndRef} className="h-1" />
      </div>
    </div>
  );
});

const MessageItem = memo(
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

    return (
      <div className="[content-visibility:auto] [contain-intrinsic-size:0_160px]">
        <div
          className={`flex ${
            message.role === "user" ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={clsx(
              "md:max-w-[75%] leading-7",
              message.role === "user" &&
                attachments.length === 0 &&
                userMessageStyle(content),
              message.role === "assistant" && [
                "text-foreground rounded-lg py-3",
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
          </div>
        </div>
        <MessageTokenUsage message={message} />
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

MessageItem.displayName = "MessageItem";

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
          {tooltip}
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
    .map((slug) => toolApps.find((app) => app.slug === slug)?.logo)
    .filter((logo): logo is string => !!logo);

const MarkdownPart = memo(({ text }: { text: string }) => (
  <div>
    <div className="text-sm md:text-base prose prose-sm prose-neutral md:prose-base max-w-none leading-loose prose-headings:text-foreground prose-p:text-[#364153] prose-strong:text-foreground prose-li:text-[#364153] prose-th:text-[#364153] prose-td:text-[#364153] prose-a:text-primary prose-code:text-foreground prose-pre:bg-secondary dark:prose-invert dark:prose-p:text-[#d1d5dc] dark:prose-li:text-[#d1d5dc] dark:prose-th:text-[#d1d5dc] dark:prose-td:text-[#d1d5dc]">
      <ReactMarkdown
        remarkPlugins={markdownRemarkPlugins}
        rehypePlugins={markdownRehypePlugins}
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
            const isPdf =
              attachment.name?.toLowerCase().endsWith(".pdf") ||
              attachment.contentType === "application/pdf";

            return (
              <div
                key={`${attachment.url}-${attachmentIndex}`}
                className={`rounded-lg overflow-hidden border border-border ${
                  attachments.length > 1
                    ? "max-w-[48%] max-h-[100px] aspect-square bg-muted"
                    : "min-w-[100px] max-w-[200px]"
                }`}
              >
                {isPdf ? (
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-full w-full min-h-[120px]"
                  >
                    <div className="flex flex-col items-center justify-center h-full w-full gap-2 p-2 bg-muted">
                      <FileText className="h-8 w-8 text-muted-foreground " />
                      <span className="text-xs text-primary hover:text-primary/80 transition-colors mt-1 text-center max-w-full">
                        {attachment.name || "PDF Document"}
                      </span>
                    </div>
                  </a>
                ) : (
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
        <p className="text-sm md:text-base whitespace-pre-wrap leading-loose">
          {content}
        </p>
      </div>
    </div>
  ),
);

UserMessage.displayName = "UserMessage";

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
        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-w-prose">
          {text}
        </div>
      )}
    </div>
  );
};

const heightClass = `min-h-[calc(100vh-19rem)] md:min-h-[calc(100vh-20rem)]`;

const isNearBottom = (element: HTMLElement | null) => {
  if (!element) return true;

  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    scrollBottomThreshold
  );
};

const getMessageSnapshot = (messages: ThreadMessage[]) => ({
  count: messages.length,
  firstId: messages[0]?.id,
  lastId: messages.at(-1)?.id,
});

const MessageTokenUsage = ({ message }: { message: ThreadMessage }) => {
  const metadata = message.metadata;
  const inputTokens = metadata?.inputTokens ?? 0;
  const outputTokens = metadata?.outputTokens ?? 0;
  const totalTokens = metadata?.totalTokens ?? inputTokens + outputTokens;

  if (totalTokens === 0) {
    return null;
  }

  return (
    <div
      className={clsx(
        "mt-1 flex text-[11px] leading-none text-muted-foreground/70",
        message.role === "user" ? "justify-end" : "justify-start",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 rounded-full px-1.5 py-1 tabular-nums">
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
    </div>
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
