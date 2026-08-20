import { useMutation, useQueryClient } from "@tanstack/react-query";
import referralService from "@/lib/services/referral-service";
import { handleError } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { referralKeys } from "./use-referral";

export const useReferralActions = () => {
  const { uid } = useAuth();
  const queryClient = useQueryClient();

  const redeem = useMutation({
    mutationFn: referralService.redeem,
    onError: (error) => handleError(error, "Unable to apply referral"),
    onSettled: () => {
      if (!uid) return;
      void queryClient.invalidateQueries({ queryKey: referralKeys.detail(uid) });
    },
  });

  return { redeem };
};
