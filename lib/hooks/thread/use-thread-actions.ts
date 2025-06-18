import { useMutation, useQueryClient } from "@tanstack/react-query";
import threadService from "@/lib/services/thread-service";
import { ThreadMessage, Thread } from "@/lib/types/thread";
import { threadKeys } from "./use-threads";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";

export const useThreadActions = () => {
  const qc = useQueryClient();

  const createThread = useMutation({
    mutationFn: threadService.createThread,
    onSuccess: (newThread) => {
      qc.setQueryData(threadKeys.all, (oldData: Thread[] | undefined) => {
        if (!oldData) return [newThread];
        return [newThread, ...oldData];
      });
    },
    onError: (error) => handleError(error, "Failed to create thread"),
  });

  const updateThread = useMutation({
    mutationFn: threadService.updateThread,
    onSuccess: (_, { threadId, title }) => {
      qc.setQueryData(threadKeys.all, (oldData: Thread[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map((thread) =>
          thread.id === threadId ? { ...thread, title } : thread
        );
      });
    },
    onError: (error) => handleError(error, "Failed to update thread"),
  });

  const deleteThread = useMutation({
    mutationFn: threadService.deleteThread,
    onSuccess: (_, { threadId }) => {
      qc.setQueryData(threadKeys.all, (oldData: Thread[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.filter((thread) => thread.id !== threadId);
      });
    },
    onError: (error) => handleError(error, "Failed to delete thread"),
  });

  const addMessageToThread = useMutation({
    mutationFn: threadService.addMessageToThread,
    onSuccess: (_, { threadId, messageData }) => {
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
            lastMessagePreview: messageData.content.substring(0, 100),
            updatedAt: new Date().toISOString(),
          };
        }
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
      // Copy share URL to clipboard
      const shareUrl = `${window.location.origin}/share/${shareId}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied to clipboard");
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
