import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import helperService, {
  type HelperPageCursor,
} from "@/lib/services/helper-service";
import type { Helper, HelperOverview } from "@/lib/types/helper";
import { handleError } from "@/lib/utils";

export const helperKeys = { all: ["helpers"] as const };

export function useHelper(helperId: string | null) {
  const { uid } = useAuth();
  return useQuery({
    queryKey: [...helperKeys.all, uid, "detail", helperId],
    queryFn: () => helperService.getById(helperId!),
    enabled: Boolean(uid && helperId),
    staleTime: 30_000,
  });
}

export function useHelpers() {
  const { uid } = useAuth();
  const {
    data: pages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [...helperKeys.all, uid],
    queryFn: ({ pageParam }) => helperService.getOverview(pageParam),
    initialPageParam: undefined as HelperPageCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(uid),
    staleTime: 30_000,
  });

  const data = useMemo<HelperOverview | undefined>(() => {
    if (!pages) return undefined;
    const helpers = new Map<string, Helper>();
    for (const page of pages.pages) {
      for (const helper of page.helpers) helpers.set(helper.id, helper);
    }
    const [first] = pages.pages;
    return {
      helpers: [...helpers.values()],
      addedHelperIds: first?.addedHelperIds ?? [],
      ownedHelperIds: first?.ownedHelperIds ?? [],
    };
  }, [pages]);

  return { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage };
}

export function useHelperActions() {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: helperKeys.all });

  const createHelper = useMutation({
    mutationFn: helperService.create.bind(helperService),
    onSuccess: refresh,
    onError: (error) => handleError(error, "Could not create Helper"),
  });
  const updateHelper = useMutation({
    mutationFn: helperService.update.bind(helperService),
    onSuccess: refresh,
    onError: (error) => handleError(error, "Could not update Helper"),
  });
  const removeHelper = useMutation({
    mutationFn: helperService.remove.bind(helperService),
    onSuccess: refresh,
    onError: (error) => handleError(error, "Could not remove Helper"),
  });
  const addHelper = useMutation({
    mutationFn: helperService.add.bind(helperService),
    onSuccess: refresh,
    onError: (error) => handleError(error, "Could not add Helper"),
  });
  const unaddHelper = useMutation({
    mutationFn: helperService.unadd.bind(helperService),
    onSuccess: refresh,
    onError: (error) => handleError(error, "Could not remove Helper"),
  });

  return { createHelper, updateHelper, removeHelper, addHelper, unaddHelper };
}
