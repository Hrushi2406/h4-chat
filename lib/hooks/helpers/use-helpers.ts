import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import helperService from "@/lib/services/helper-service";
import { handleError } from "@/lib/utils";

export const helperKeys = { all: ["helpers"] as const };

export function useHelpers() {
  const { uid } = useAuth();
  return useQuery({
    queryKey: [...helperKeys.all, uid],
    queryFn: () => helperService.getOverview(),
    enabled: Boolean(uid),
    staleTime: 30_000,
  });
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
