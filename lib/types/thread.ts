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
    experimental_attachments: attachments ?? [],
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

// Time period types for thread grouping
export type ThreadTimePeriod = "today" | "yesterday" | "last7days" | "older";

export interface GroupedThreads {
  today: Thread[];
  yesterday: Thread[];
  last7days: Thread[];
  older: Thread[];
}

// Utility function to group threads by time periods
export const groupThreadsByTimePeriod = (threads: Thread[]): GroupedThreads => {
  console.log("im running: ");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const grouped: GroupedThreads = {
    today: [],
    yesterday: [],
    last7days: [],
    older: [],
  };

  threads.forEach((thread) => {
    const threadDate = new Date(thread.updatedAt);
    const threadDay = new Date(
      threadDate.getFullYear(),
      threadDate.getMonth(),
      threadDate.getDate()
    );

    if (threadDay.getTime() === today.getTime()) {
      grouped.today.push(thread);
    } else if (threadDay.getTime() === yesterday.getTime()) {
      grouped.yesterday.push(thread);
    } else if (threadDate >= sevenDaysAgo) {
      grouped.last7days.push(thread);
    } else {
      grouped.older.push(thread);
    }

    console.log("thread: ", thread.title, threadDay);
  });

  // Sort threads within each group by updatedAt (most recent first)
  Object.keys(grouped).forEach((key) => {
    grouped[key as ThreadTimePeriod].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  });

  return grouped;
};

// Helper function to get section label
export const getTimePeriodLabel = (period: ThreadTimePeriod): string => {
  switch (period) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "last7days":
      return "Last 7 Days";
    case "older":
      return "Older";
    default:
      return "";
  }
};
