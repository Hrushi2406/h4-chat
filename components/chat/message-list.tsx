"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import rehypeRaw from "rehype-raw";
import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TextShimmer } from "@/components/ui/text-shimmer";
import clsx from "clsx";
import { getToolDisplayName } from "@/lib/types/tool-mappings";
import {
  getMessageAttachments,
  getMessageContent,
  ThreadMessage,
  ThreadMessageMetadata,
} from "@/lib/types/thread";
import { FileText, ChevronDown, ChevronRight, Sparkles, ListTree } from "lucide-react";
import CodeBlock from "./code-block";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MessageListProps {
  messages: ThreadMessage[];
  status?: "submitted" | "streaming" | "ready" | "error";
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}

export const MessageList = ({
  messages,
  status = "ready",
  suggestions,
  onSuggestionClick,
}: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(messages.length);

  // Show loading indicator only when status is "submitted" (before streaming starts)
  const showLoadingIndicator = status === "submitted";

  // Auto-scroll to bottom only when new messages are added (not during streaming updates)
  useEffect(() => {
    const currentMessageCount = messages.length;
    const hasNewMessage = currentMessageCount > previousMessageCountRef.current;

    if (hasNewMessage && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }

    previousMessageCountRef.current = currentMessageCount;
  }, [messages]);

  // Auto-scroll to bottom when loading indicator appears
  useEffect(() => {
    if (showLoadingIndicator && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [showLoadingIndicator]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-3 md:space-y-4 max-w-4xl mx-auto">
        {messages.map((message, index) => {
          const content = getMessageContent(message);
          const attachments = getMessageAttachments(message);
          // Check if this is the last assistant message
          const isLastAssistantMessage =
            message.role === "assistant" && index === messages.length - 1;

          return (
            <div key={message.id}>
              <div
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={clsx(
                    "md:max-w-[75%] leading-7",
                    message.role === "user" &&
                      attachments.length === 0 && [
                        userMessageStyle(message),
                      ],
                    message.role === "assistant" && [
                      "text-foreground rounded-lg py-3",
                      isLastAssistantMessage && heightClass,
                    ]
                  )}
                >
                  {message.role === "assistant" ? (
                    <>
                      {(() => {
                        const reasoningPart = message.parts?.find(
                          (p: any) => p.type === "reasoning"
                        ) as any;
                        if (!reasoningPart) return null;
                        return (
                          <ReasoningBlock
                            text={reasoningPart.text}
                            isStreaming={
                              isLastAssistantMessage &&
                              (status === "streaming" ||
                                status === "submitted")
                            }
                          />
                        );
                      })()}
                      {message.parts?.map((part: any, index) => {
                        if (part.type === "reasoning") return null;

                        if (
                          part.type === "dynamic-tool" ||
                          part.type.startsWith("tool-")
                        ) {
                          const toolStatus = part.state;
                          const toolName =
                            part.toolName ?? part.type.replace(/^tool-/, "");

                          const isCalling =
                            toolStatus === "input-streaming" ||
                            toolStatus === "input-available";
                          const { displayName, Icon, tooltip } =
                            getToolDisplayName(toolName, toolStatus, part);

                          return (
                            <Tooltip key={index}>
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
                                      <Icon className="w-4 h-4 text-blue-500 animate-bounce" />
                                      <TextShimmer
                                        className="text-sm md:text-base [--base-color:theme(colors.blue.600)] [--base-gradient-color:theme(colors.blue.200)] dark:[--base-color:theme(colors.blue.700)] dark:[--base-gradient-color:theme(colors.blue.400)]"
                                        duration={1.5}
                                        spread={1.5}
                                      >
                                        {displayName}
                                      </TextShimmer>
                                    </div>
                                  ) : (
                                    <div
                                      key={`${toolName}-${toolStatus}`}
                                      className="flex items-center gap-2 text-sm md:text-sm"
                                    >
                                      <Icon className="w-4 h-4" />
                                      {displayName}
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
                        }
                        if (part.type === "text") {
                          return (
                            <div key={index}>
                              <div
                                className="text-sm md:text-base prose prose-sm md:prose-base max-w-none leading-loose "
                                key={index}
                              >
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkToc]}
                                  rehypePlugins={[rehypeRaw]}
                                  components={{
                                    code: ({ children, className }) => {
                                      const match = /language-(\w+)/.exec(
                                        className || ""
                                      );

                                      if (!match) {
                                        return (
                                          <code className={className}>
                                            {children}
                                          </code>
                                        );
                                      }

                                      return (
                                        <CodeBlock
                                          value={String(children).replace(
                                            /\n$/,
                                            ""
                                          )}
                                          language={match[1]}
                                        />
                                      );
                                    },
                                    pre: ({ children }) => (
                                      <div className="bg-secondary p-2 rounded-lg">
                                        {children}
                                      </div>
                                    ),
                                    a: ({ href, children }) => (
                                      <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:text-primary/80 transition-colors"
                                      >
                                        {children}
                                      </a>
                                    ),
                                  }}
                                >
                                  {part.text}
                                </ReactMarkdown>
                              </div>
                              {isLastAssistantMessage &&
                                suggestions.length > 0 && (
                                  <div className="mt-4">
                                    <div
                                      className="flex flex-wrap gap-2"
                                      key={`suggestions-${suggestions.length}`}
                                    >
                                      {suggestions.map(
                                        (suggestion, suggestionIndex) => (
                                          <motion.button
                                            key={`${suggestionIndex}-${suggestion}`}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{
                                              duration: 0.2,
                                              delay: suggestionIndex * 0.06,
                                              ease: "easeOut",
                                            }}
                                            onClick={() =>
                                              onSuggestionClick?.(suggestion)
                                            }
                                            className="px-3 py-1.5 md:px-3 md:py-1.5 text-xs md:text-sm bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-full transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer slide-in-from-bottom "
                                          >
                                            {suggestion}
                                          </motion.button>
                                        )
                                      )}
                                    </div>
                                  </div>
                                )}
                            </div>
                          );
                        }
                      })}
                    </>
                  ) : (
                    <div className="">
                      {/* Display text content */}
                      {attachments.length > 0 && (
                        <div
                          className={`mb-3 flex justify-end ${
                            attachments.length > 1
                              ? "flex-wrap gap-1"
                              : ""
                          }`}
                        >
                          {attachments.map(
                            (attachment, attachmentIndex) => {
                              const isPdf =
                                attachment.name
                                  ?.toLowerCase()
                                  .endsWith(".pdf") ||
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
                                        <span className="text-xs text-primary hover:text-primary/80 transition-colors mt-1 text-center  max-w-full">
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
                            }
                          )}
                        </div>
                      )}
                      <div
                        className={
                          attachments.length > 0
                            ? clsx(
                                "max-w-max ml-auto text-right self-end justify-end",
                                userMessageStyle(message)
                              )
                            : undefined
                        }
                      >
                        <p className="text-sm md:text-base whitespace-pre-wrap leading-loose">
                          {content}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <MessageTokenUsage message={message} />
            </div>
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
        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-w-prose">
          {text}
        </div>
      )}
    </div>
  );
};

const heightClass = `min-h-[calc(100vh-19rem)] md:min-h-[calc(100vh-20rem)]`;

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
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="rounded-full px-1.5 py-1 tabular-nums">
            {formatTokenCount(totalTokens)} tokens
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {formatTokenUsage(metadata)}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

const formatTokenUsage = (metadata?: ThreadMessageMetadata) => {
  const inputTokens = metadata?.inputTokens ?? 0;
  const outputTokens = metadata?.outputTokens ?? 0;

  return `${formatTokenCount(inputTokens)} input + ${formatTokenCount(
    outputTokens
  )} output tokens`;
};

const formatTokenCount = (tokenCount: number) => {
  if (tokenCount >= 1_000) {
    return `${Math.round(tokenCount / 1_000)}K`;
  }

  return tokenCount.toString();
};

const userMessageStyle = (message: ThreadMessage) => {
  const content = getMessageContent(message);
  return clsx(
    "bg-secondary text-secondary-foreground px-3 md:px-4 py-1 md:py-1.5",
    content.length <= 50 ? "rounded-full" : "rounded-2xl"
  );
};
