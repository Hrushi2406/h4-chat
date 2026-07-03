import type { FileUIPart, UIMessage } from "ai";
import { v4 } from "uuid";
import { getToolStorageMetadata } from "@/lib/types/tool-mappings";

export interface Attachment {
  id?: string;
  name?: string;
  url: string;
  contentType?: string;
}

export interface ThreadMessageMetadata {
  model?: string;
  requestedModel?: string;
  effectiveModel?: string;
  imageFallbackUsed?: boolean;
  tokenCount?: number;
  processingTime?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

// Extend Vercel AI Message type for our thread messages
export interface ThreadMessage extends UIMessage<ThreadMessageMetadata> {
  content: string;
  createdAt?: Date;
  updatedAt: string;
  experimental_attachments?: Attachment[];
}

// Thread interface for Firestore
export interface Thread {
  id: string;
  title: string;
  messages: ThreadMessage[];
  createdAt: Date;
  updatedAt: Date;
  userId?: string;
  shareId?: string;
  scheduledTaskId?: string;
  scheduledTaskRunId?: string;
  // Composio Tool Router session id, written server-side by the chat route so
  // multi-turn messages reuse one session instead of recreating it each turn.
  composioSessionId?: string;
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
    parts: [
      { type: "text", text: input },
      ...attachmentsToFileParts(attachments ?? []),
    ],
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
    parts: [{ type: "text", text: msg }],
    createdAt: new Date(),
    updatedAt: new Date().toISOString(),
  };
};

export const attachmentsToFileParts = (
  attachments: Attachment[]
): FileUIPart[] =>
  attachments.map((attachment) => ({
    type: "file",
    mediaType: attachment.contentType ?? "application/octet-stream",
    filename: attachment.name,
    url: attachment.url,
  }));

export const getMessageContent = (message: UIMessage | ThreadMessage) => {
  if ("content" in message && typeof message.content === "string") {
    return message.content;
  }

  return getArrayLikeParts(message.parts)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
};

export const getMessageAttachments = (
  message: UIMessage | ThreadMessage
): Attachment[] => {
  if (
    "experimental_attachments" in message &&
    Array.isArray(message.experimental_attachments)
  ) {
    return message.experimental_attachments;
  }

  return getArrayLikeParts(message.parts)
    .filter((part): part is FileUIPart => part.type === "file")
    .map((part) => ({
      name: part.filename,
      url: part.url,
      contentType: part.mediaType,
    }));
};

export const normalizeThreadMessage = (
  message: UIMessage | Partial<ThreadMessage>
): ThreadMessage => {
  const storedMessage = message as Partial<ThreadMessage>;
  const parts = "parts" in message ? getArrayLikeParts(message.parts) : [];
  const content =
    "content" in message && typeof message.content === "string"
      ? message.content
      : parts.length > 0
      ? getMessageContent({ ...message, parts } as UIMessage)
      : "";
  const attachments =
    "experimental_attachments" in message &&
    getArrayLike(message.experimental_attachments).length > 0
      ? getArrayLike<Attachment>(message.experimental_attachments)
      : parts.length > 0
      ? getMessageAttachments({ ...message, parts } as UIMessage)
      : [];

  return {
    id: message.id ?? v4(),
    role: message.role ?? "assistant",
    content,
    parts:
      parts.length > 0
        ? parts
        : [{ type: "text", text: content }, ...attachmentsToFileParts(attachments)],
    createdAt: storedMessage.createdAt,
    updatedAt: storedMessage.updatedAt ?? new Date().toISOString(),
    experimental_attachments: attachments,
    metadata: storedMessage.metadata,
  };
};

const MAX_STORED_TEXT_CHARS = 100_000;
const MAX_STORED_TOOL_FIELD_CHARS = 2_000;
const TOOL_PAYLOAD_KEYS = new Set([
  "args",
  "data",
  "input",
  "output",
  "result",
  "results",
  "response",
  "responses",
  "content",
  "schema",
  "schemas",
]);

export const serializeThreadMessageForFirestore = (
  message: ThreadMessage
): ThreadMessage =>
  sanitizeFirestoreValue(compactThreadMessage(normalizeThreadMessage(message)), true);

const compactThreadMessage = (message: ThreadMessage): ThreadMessage => {
  const compactContent = truncateString(message.content, MAX_STORED_TEXT_CHARS);

  return {
    ...message,
    content: compactContent.value,
    parts: getArrayLikeParts(message.parts).map(compactMessagePart),
    ...(compactContent.truncated ? { truncated: true } : {}),
  } as ThreadMessage;
};

const compactMessagePart = (part: UIMessage["parts"][number]) => {
  if (part.type === "text") {
    const text = truncateString(part.text, MAX_STORED_TEXT_CHARS);

    return {
      ...part,
      text: text.value,
      ...(text.truncated ? { truncated: true } : {}),
    };
  }

  if (part.type === "file" && part.url?.startsWith("data:")) {
    const url = truncateString(part.url, MAX_STORED_TOOL_FIELD_CHARS);

    return {
      ...part,
      url: url.value,
      ...(url.truncated ? { truncated: true } : {}),
    };
  }

  if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
    return compactToolPart(part);
  }

  return part;
};

const compactToolPart = (part: UIMessage["parts"][number]) => {
  const source = part as Record<string, unknown>;
  const toolName = getToolPartName(source);
  const state = typeof source.state === "string" ? source.state : "";
  const compacted = Object.fromEntries(
    Object.entries(source).map(([key, value]) => {
      if (TOOL_PAYLOAD_KEYS.has(key.toLowerCase())) {
        return [key, compactToolPayload(value)];
      }

      return [key, value];
    })
  );

  return {
    ...compacted,
    toolDisplay: getToolStorageMetadata(toolName, state, part),
  } as unknown as UIMessage["parts"][number];
};

const getToolPartName = (source: Record<string, unknown>) => {
  if (typeof source.toolName === "string" && source.toolName.trim()) {
    return source.toolName;
  }

  if (typeof source.type === "string") {
    return source.type.replace(/^tool-/, "");
  }

  return "tool";
};

const compactToolPayload = (value: unknown) => {
  const existingPreview = getExistingCompactPreview(value);
  const serialized = existingPreview?.preview ?? stringifyForStoragePreview(value);
  const truncated = truncateString(serialized, MAX_STORED_TOOL_FIELD_CHARS);

  return {
    preview: truncated.value,
    truncated: truncated.truncated || Boolean(existingPreview?.truncated),
  };
};

const getExistingCompactPreview = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  if (typeof source.preview !== "string") {
    return undefined;
  }

  let preview = source.preview;
  let truncated = Boolean(source.truncated);

  for (let i = 0; i < 10; i += 1) {
    const parsed = parseJsonObject(preview);
    if (!parsed || typeof parsed.preview !== "string") {
      break;
    }

    preview = parsed.preview;
    truncated = truncated || Boolean(parsed.truncated);
  }

  return { preview, truncated };
};

const parseJsonObject = (value: string): Record<string, unknown> | undefined => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

const stringifyForStoragePreview = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return json;
  } catch {
    /* non-serializable */
  }
  return value === undefined ? "" : String(value);
};

const truncateString = (value: string | undefined, maxLength: number) => {
  const v = value ?? "";
  if (v.length <= maxLength) return { value: v, truncated: false };
  return {
    value: `${v.slice(0, maxLength)}\n\n[truncated ${v.length - maxLength} characters]`,
    truncated: true,
  };
};

const sanitizeFirestoreValue = <T,>(value: T, insideArray = false): T => {
  if (value === undefined) {
    return undefined as T;
  }

  if (value === null || value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    const sanitizedItems = value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestoreValue(item, true));

    if (insideArray) {
      return Object.fromEntries(
        sanitizedItems.map((item, index) => [String(index), item])
      ) as T;
    }

    return sanitizedItems as T;
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sanitizeFirestoreValue(item, insideArray)])
    ) as T;
  }

  return value;
};

const getArrayLikeParts = (value: unknown): UIMessage["parts"] =>
  getArrayLike<UIMessage["parts"][number]>(value);

const getArrayLike = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const entries = Object.entries(value as Record<string, T>);

  if (!entries.every(([key]) => /^\d+$/.test(key))) {
    return [];
  }

  return entries
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, item]) => item);
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
