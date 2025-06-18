"use client";

import { Message } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import rehypeRaw from "rehype-raw";
import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { TextShimmer } from "@/components/ui/text-shimmer";
import clsx from "clsx";
import { getToolDisplayName } from "@/lib/types/tool-mappings";
import { ThreadMessage } from "@/lib/types/thread";
import { Divide, FilesIcon, FileText } from "lucide-react";
import CodeBlock from "./code-block";

interface MessageListProps {
  messages: Message[];
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
                      !message.experimental_attachments && [
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
                      {message.parts?.map((part, index) => {
                        console.log("part: ", part);
                        console.log("message: ", message.reasoning);

                        if (part.type === "reasoning") {
                          return (
                            <div key={index}>
                              <p>Reasoning:</p>
                              <p>{part.reasoning}</p>
                            </div>
                          );
                        }

                        if (part.type === "tool-invocation") {
                          const toolStatus = part.toolInvocation.state;
                          const toolName = part.toolInvocation.toolName;

                          const isCalling =
                            toolStatus === "partial-call" ||
                            toolStatus === "call";
                          const { displayName, Icon } = getToolDisplayName(
                            toolName,
                            toolStatus
                          );

                          return (
                            <div
                              className={`inline-flex items-center gap-2 mr-2 text-sm rounded-full my-2 transition-all duration-300 ease-in-out ${
                                isCalling
                                  ? "px-0 py-0"
                                  : "px-3 py-1.5 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                              }`}
                              key={index}
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
                                    code: ({ children, className }) => (
                                      <CodeBlock
                                        value={children as string}
                                        language={
                                          className?.split("-")[1] || "js"
                                        }
                                      />
                                    ),
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
                      {message.experimental_attachments && (
                        <div
                          className={`mb-3 flex justify-end ${
                            message.experimental_attachments.length > 1
                              ? "flex-wrap gap-1"
                              : ""
                          }`}
                        >
                          {message.experimental_attachments.map(
                            (attachment) => {
                              const isPdf =
                                attachment.name
                                  ?.toLowerCase()
                                  .endsWith(".pdf") ||
                                attachment.contentType === "application/pdf";

                              return (
                                <div
                                  key={attachment.url}
                                  className={`rounded-lg overflow-hidden border border-border ${
                                    message.experimental_attachments!.length > 1
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
                          message.experimental_attachments &&
                          clsx(
                            "max-w-max ml-auto text-right self-end justify-end",
                            userMessageStyle(message)
                          )
                        }
                      >
                        <p className="text-sm md:text-base whitespace-pre-wrap leading-loose">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
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

const heightClass = `min-h-[calc(100vh-19rem)] md:min-h-[calc(100vh-20rem)]`;

const userMessageStyle = (message: Message) =>
  clsx(
    "bg-secondary text-secondary-foreground px-3 md:px-4 py-1 md:py-1.5",
    message.content.length <= 50 ? "rounded-full" : "rounded-2xl"
  );
