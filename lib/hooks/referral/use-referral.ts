import { useQuery } from "@tanstack/react-query";
import referralService from "@/lib/services/referral-service";
import { useAuth } from "@/lib/hooks/auth/use-auth";

export const referralKeys = {
  all: ["referral"] as const,
  detail: (uid: string) => [...referralKeys.all, uid] as const,
};

export const useReferral = () => {
  const { uid } = useAuth();

  return useQuery({
    queryKey: referralKeys.detail(uid ?? ""),
    queryFn: () => referralService.getSummary(),
    enabled: Boolean(uid),
  });
};
