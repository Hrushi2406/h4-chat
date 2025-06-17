import { Message } from "@ai-sdk/react";
import { Attachment } from "ai";
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

// Thread interface for Firestore
export interface Thread {
  id: string;
  title: string;
  messages: ThreadMessage[];
  createdAt: Date;
  updatedAt: Date;
  userId?: string;
  messageCount: number;
  lastMessagePreview?: string;
}

// Generate default thread function
export const generateDefaultThread = (userId?: string): Thread => {
  const now = new Date();
  return {
    id: v4(),
    title: `Chat ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString(
      [],
      { hour: "2-digit", minute: "2-digit" }
    )}`,
    messages: [],
    createdAt: now,
    updatedAt: now,
    userId,
    messageCount: 0,
    lastMessagePreview: undefined,
  };
};

export const generateDefaultUserMessage = (
  input: string,
  attachments?: Attachment[]
): ThreadMessage => {
  return {
    id: v4(),
    role: "user",
    content: input,
    createdAt: new Date(),
    updatedAt: new Date().toISOString(),
    experimental_attachments: attachments,
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
