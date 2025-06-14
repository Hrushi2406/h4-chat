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

interface MessageListProps {
  messages: Message[];
  status?: "submitted" | "streaming" | "ready" | "error";
}

export const MessageList = ({
  messages,
  status = "ready",
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
                    message.role === "user" && [
                      "bg-secondary text-secondary-foreground  px-3 md:px-4 py-1 md:py-1.5",
                      message.content.length <= 50
                        ? "rounded-full"
                        : "rounded-2xl",
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
                        if (part.type === "text") {
                          return (
                            <div key={index}>
                              <div
                                className="text-sm md:text-base prose prose-sm md:prose-base max-w-none leading-loose"
                                key={index}
                              >
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkToc]}
                                  rehypePlugins={[rehypeRaw]}
                                  components={{
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
                            </div>
                          );
                        }
                      })}
                    </>
                  ) : (
                    <p className="text-sm md:text-base whitespace-pre-wrap leading-loose">
                      {message.content}
                    </p>
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
