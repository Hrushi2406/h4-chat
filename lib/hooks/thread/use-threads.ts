import { useQuery, useQueryClient } from "@tanstack/react-query";
import threadService from "@/lib/services/thread-service";
import { Thread } from "@/lib/types/thread";

export const threadKeys = {
  all: ["threads"] as const,
  detail: (id: string) => ["threads", id] as const,
};

export const useThreads = ({
  userId,
}: {
  userId?: string;
} = {}) => {
  const qc = useQueryClient();

  return useQuery({
    queryKey: threadKeys.all,
    queryFn: async () => {
      const data = await threadService.getThreads({ userId });
      if (data) {
        data.forEach((thread: Thread) => {
          console.log("Setting thread in cache: ", thread.id);
          qc.setQueryData(threadKeys.detail(thread.id), thread);
        });
      }
      return data;
    },
  });
};

export const useThread = (threadId: string, isNew?: boolean) => {
  return useQuery({
    queryKey: threadKeys.detail(threadId),
    queryFn: () => threadService.getThread({ threadId }),
    enabled: !!threadId && !isNew,
  });
};
