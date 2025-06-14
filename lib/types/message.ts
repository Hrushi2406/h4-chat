import { Message } from "@ai-sdk/react";
import { v4 } from "uuid";

// Extend Vercel AI Message type for our thread messages
export interface ThreadMessage extends Message {
  updatedAt: string;
  metadata?: {
    model?: string;
    tokenCount?: number;
    processingTime?: number;
  };
}

export const generateDefaultUserMessage = (input: string): ThreadMessage => {
  return {
    id: v4(),
    role: "user",
    content: input,
    createdAt: new Date(),
    updatedAt: new Date().toISOString(),
  };
};
export const generateDefaultErrorMessage = (msg: string): ThreadMessage => {
  return {
    id: v4(),
    role: "assistant",
    content: msg,
    createdAt: new Date(),
    updatedAt: new Date().toISOString(),
  };
};
