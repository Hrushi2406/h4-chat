import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import threadService from "@/lib/services/thread-service";
import { getMessageContent, ThreadMessage, Thread } from "@/lib/types/thread";
import { threadKeys } from "./use-threads";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";
import type { ThreadCursor, ThreadsPage } from "@/lib/services/thread-service";

type ThreadsInfiniteData = InfiniteData<ThreadsPage, ThreadCursor | null>;
type NativeShareResult = "shared" | "cancelled" | "failed";

const shareViaNativeSheet = async (
  shareUrl: string
): Promise<NativeShareResult> => {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "failed";
  }
  try {
    if (typeof navigator.canShare === "function" && !navigator.canShare({ url: shareUrl })) {
      return "failed";
    }
    await navigator.share({ title: "Sakhi AI", url: shareUrl });
    return "shared";
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError"
      ? "cancelled"
      : "failed";
  }
};

const copyToClipboard = async (value: string) => {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
};

const isInstalledApp = () => {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
};

const upsertThreadInList = (
  data: ThreadsInfiniteData | undefined,
  thread: Thread
): ThreadsInfiniteData | undefined => {
  if (!data) {
    return {
      pages: [{ threads: [thread], nextCursor: null }],
      pageParams: [null],
    };
  }

  if (data.pages.length === 0) {
    return {
      ...data,
      pages: [{ threads: [thread], nextCursor: null }],
      pageParams: data.pageParams.length > 0 ? data.pageParams : [null],
    };
  }

  const pages = data.pages.map((page, index) => {
    const threadsWithoutCurrent = page.threads.filter(
      (currentThread) => currentThread.id !== thread.id
    );

    return {
      ...page,
      threads:
        index === 0 ? [thread, ...threadsWithoutCurrent] : threadsWithoutCurrent,
    };
  });

  return { ...data, pages };
};

const updateThreadInList = (
  data: ThreadsInfiniteData | undefined,
  threadId: string,
  update: (thread: Thread) => Thread
): ThreadsInfiniteData | undefined => {
  if (!data) return data;

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      threads: page.threads.map((thread) =>
        thread.id === threadId ? update(thread) : thread
      ),
    })),
  };
};

const removeThreadFromList = (
  data: ThreadsInfiniteData | undefined,
  threadId: string
): ThreadsInfiniteData | undefined => {
  if (!data) return data;

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      threads: page.threads.filter((thread) => thread.id !== threadId),
    })),
  };
};

export const useThreadActions = () => {
  const qc = useQueryClient();

  const createThread = useMutation({
    mutationFn: threadService.createThread,
    onMutate: async ({ threadId, title, userId, initialMessage }) => {
      await qc.cancelQueries({ queryKey: threadKeys.all });

      const previousThreadList =
        qc.getQueryData<ThreadsInfiniteData>(threadKeys.all);
      const previousThread = qc.getQueryData<Thread>(
        threadKeys.detail(threadId)
      );
      const now = new Date();
      const optimisticThread: Thread = {
        id: threadId,
        title,
        messages: [{ ...initialMessage, updatedAt: now.toISOString() }],
        createdAt: now,
        updatedAt: now,
        userId,
        messageCount: 1,
        lastMessagePreview: getMessageContent(initialMessage).substring(0, 100),
      };

      qc.setQueryData(threadKeys.detail(threadId), optimisticThread);
      qc.setQueryData<ThreadsInfiniteData>(threadKeys.all, (oldData) =>
        upsertThreadInList(oldData, optimisticThread)
      );

      return { previousThreadList, previousThread };
    },
    onSuccess: (newThread) => {
      qc.setQueryData(threadKeys.detail(newThread.id), newThread);
      qc.setQueryData<ThreadsInfiniteData>(threadKeys.all, (oldData) =>
        upsertThreadInList(oldData, newThread)
      );
      qc.invalidateQueries({ queryKey: threadKeys.all });
    },
    onError: (error, variables, context) => {
      qc.setQueryData(threadKeys.all, context?.previousThreadList);
      if (context?.previousThread) {
        qc.setQueryData(
          threadKeys.detail(variables.threadId),
          context.previousThread
        );
      } else {
        qc.removeQueries({ queryKey: threadKeys.detail(variables.threadId) });
      }
      handleError(error, "Failed to create thread");
    },
  });

  const updateThread = useMutation({
    mutationFn: threadService.updateThread,
    onSuccess: (_, { threadId, title }) => {
      qc.setQueryData(
        threadKeys.detail(threadId),
        (oldData: Thread | undefined) =>
          oldData ? { ...oldData, title } : oldData
      );
      qc.setQueryData<ThreadsInfiniteData>(threadKeys.all, (oldData) =>
        updateThreadInList(oldData, threadId, (thread) => ({ ...thread, title }))
      );
      qc.invalidateQueries({ queryKey: threadKeys.all });
    },
    onError: (error) => handleError(error, "Failed to update thread"),
  });

  const deleteThread = useMutation({
    mutationFn: threadService.deleteThread,
    onSuccess: (_, { threadId }) => {
      qc.removeQueries({ queryKey: threadKeys.detail(threadId) });
      qc.setQueryData<ThreadsInfiniteData>(threadKeys.all, (oldData) =>
        removeThreadFromList(oldData, threadId)
      );
      qc.invalidateQueries({ queryKey: threadKeys.all });
    },
    onError: (error) => handleError(error, "Failed to delete thread"),
  });

  const addMessageToThread = useMutation({
    mutationFn: threadService.addMessageToThread,
    onSuccess: (_, { threadId, messageData }) => {
      const updatedAt = new Date().toISOString();
      qc.setQueryData(
        threadKeys.detail(threadId),
        (oldData: Thread | undefined) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            messages: [
              ...oldData.messages,
              {
                ...messageData,
              },
            ],
            messageCount: oldData.messageCount + 1,
            lastMessagePreview: getMessageContent(messageData).substring(0, 100),
            updatedAt: new Date(updatedAt),
          };
        }
      );
      qc.setQueryData<ThreadsInfiniteData>(threadKeys.all, (oldData) =>
        updateThreadInList(oldData, threadId, (thread) => ({
          ...thread,
          messageCount: thread.messageCount + 1,
          lastMessagePreview: getMessageContent(messageData).substring(0, 100),
          updatedAt: new Date(updatedAt),
        }))
      );
    },
    onError: (error) => handleError(error, "Failed to add message to thread"),
  });

  const shareThread = useMutation({
    mutationFn: threadService.shareThread,
    onSuccess: async (shareId, { threadId }) => {
      qc.setQueryData(
        threadKeys.detail(threadId),
        (oldData: Thread | undefined) => {
          if (!oldData) return oldData;
          return { ...oldData, shareId: shareId };
        }
      );
      const shareUrl = `${window.location.origin}/share/${shareId}`;
      if (!isInstalledApp()) {
        if (await copyToClipboard(shareUrl)) {
          toast.success("Share link copied to clipboard");
          return;
        }
        window.prompt("Copy share link", shareUrl);
        toast.info("Clipboard permission blocked, copied link is shown in prompt");
        return;
      }
      const nativeShare = await shareViaNativeSheet(shareUrl);
      if (nativeShare === "shared") return toast.success("Share sheet opened");
      if (nativeShare === "cancelled") return;
      if (await copyToClipboard(shareUrl)) {
        toast.success("Share link copied to clipboard");
        return;
      }
      window.prompt("Copy share link", shareUrl);
      toast.info("Clipboard permission blocked, copied link is shown in prompt");
    },
    onError: (error) => handleError(error, "Failed to share thread"),
  });

  return {
    createThread,
    updateThread,
    deleteThread,
    addMessageToThread,
    shareThread,
  };
};
