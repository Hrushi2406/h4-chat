import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import threadService, { ThreadCursor } from "@/lib/services/thread-service";
import { Thread } from "@/lib/types/thread";
import { useAuth } from "../auth/use-auth";

export const threadKeys = {
  all: ["threads", "infinite"] as const,
  detail: (id: string) => ["threads", id] as const,
};

export const useThreads = () => {
  const qc = useQueryClient();
  const { uid } = useAuth();

  const query = useInfiniteQuery({
    queryKey: threadKeys.all,
    queryFn: async ({ pageParam }) => {
      const page = await threadService.getThreads({
        userId: uid!,
        cursor: pageParam,
      });

      page.threads.forEach((thread: Thread) => {
        console.log("Setting thread in cache: ", thread.id);
        qc.setQueryData(threadKeys.detail(thread.id), thread);
      });

      return page;
    },
    initialPageParam: null as ThreadCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!uid,
  });

  return {
    ...query,
    data: query.data?.pages.flatMap((page) => page.threads) ?? [],
  };
};

export const useThread = (threadId: string, isNew?: boolean) => {
  const { uid } = useAuth();

  return useQuery({
    queryKey: threadKeys.detail(threadId),
    queryFn: () => threadService.getThread({ threadId, userId: uid }),
    enabled: !!threadId && !!uid && !isNew,
  });
};
