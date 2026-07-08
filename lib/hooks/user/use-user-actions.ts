import { useMutation, useQueryClient } from "@tanstack/react-query";
import { v4 } from "uuid";
import userService from "@/lib/services/user-service";
import { IUser } from "@/lib/types/user";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { userKeys } from "./use-user";

export const useUserActions = () => {
  const queryClient = useQueryClient();

  const updateUser = useMutation({
    mutationFn: userService.updateUser,
    onMutate: async ({ uid: mutatingUid, update }) => {
      const queryKey = userKeys.detail(mutatingUid);
      await queryClient.cancelQueries({ queryKey });

      const previousUser = queryClient.getQueryData<IUser>(queryKey);

      queryClient.setQueryData<IUser>(queryKey, (current) =>
        current ? { ...current, ...update } : current,
      );

      return { previousUser, queryKey };
    },
    onSuccess: () => {
      toast.success("Changes saved successfully");
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousUser);
      }
      handleError(error, "Failed to save changes ");
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.uid) });
    },
  });

  const addMemory = useMutation({
    mutationFn: ({
      uid: mutatingUid,
      content,
    }: {
      uid: string;
      content: string;
    }) => userService.addMemory({ uid: mutatingUid, content, id: v4() }),
    onMutate: async ({ uid: mutatingUid, content }) => {
      const queryKey = userKeys.detail(mutatingUid);
      await queryClient.cancelQueries({ queryKey });

      const previousUser = queryClient.getQueryData<IUser>(queryKey);

      queryClient.setQueryData<IUser>(queryKey, (current) =>
        current
          ? {
              ...current,
              memories: [
                ...(current.memories ?? []),
                {
                  id: `optimistic-${Date.now()}`,
                  content,
                  updatedAt: new Date().toISOString(),
                },
              ],
            }
          : current,
      );

      return { previousUser, queryKey };
    },
    onSuccess: () => {
      toast.success("Memory added");
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousUser);
      }
      handleError(error, "Failed to add memory ");
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.uid) });
    },
  });

  const updateMemory = useMutation({
    mutationFn: userService.updateMemory,
    onMutate: async ({ uid: mutatingUid, memoryId, content }) => {
      const queryKey = userKeys.detail(mutatingUid);
      await queryClient.cancelQueries({ queryKey });

      const previousUser = queryClient.getQueryData<IUser>(queryKey);

      queryClient.setQueryData<IUser>(queryKey, (current) =>
        current
          ? {
              ...current,
              memories: (current.memories ?? []).map((memory) =>
                memory.id === memoryId
                  ? { ...memory, content, updatedAt: new Date().toISOString() }
                  : memory,
              ),
            }
          : current,
      );

      return { previousUser, queryKey };
    },
    onSuccess: () => {
      toast.success("Memory updated");
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousUser);
      }
      handleError(error, "Failed to update memory ");
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.uid) });
    },
  });

  const deleteMemory = useMutation({
    mutationFn: userService.deleteMemory,
    onMutate: async ({ uid: mutatingUid, memoryId }) => {
      const queryKey = userKeys.detail(mutatingUid);
      await queryClient.cancelQueries({ queryKey });

      const previousUser = queryClient.getQueryData<IUser>(queryKey);

      queryClient.setQueryData<IUser>(queryKey, (current) =>
        current
          ? {
              ...current,
              memories: (current.memories ?? []).filter(
                (memory) => memory.id !== memoryId,
              ),
            }
          : current,
      );

      return { previousUser, queryKey };
    },
    onSuccess: () => {
      toast.success("Memory deleted");
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousUser);
      }
      handleError(error, "Failed to delete memory ");
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.uid) });
    },
  });

  return {
    updateUser,
    addMemory,
    updateMemory,
    deleteMemory,
  };
};
