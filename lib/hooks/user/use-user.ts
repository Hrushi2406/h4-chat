import { useAuth } from "../auth/use-auth";
import { useQuery } from "@tanstack/react-query";
import userService from "@/lib/services/user-service";

export const userKeys = {
  all: ["users"] as const,
  detail: (uid: string) => [...userKeys.all, uid] as const,
};

export const userQueryOptions = (uid: string) => ({
  queryKey: userKeys.detail(uid),
  queryFn: () => userService.getUserInfo(uid),
});

export const useUser = (options?: { fresh?: boolean }) => {
  const { uid } = useAuth();
  return useQuery({
    ...userQueryOptions(uid ?? ""),
    enabled: !!uid,
    ...(options?.fresh
      ? { staleTime: 0, refetchOnMount: "always" as const }
      : {}),
  });
};
