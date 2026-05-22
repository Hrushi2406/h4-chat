import { useMutation } from "@tanstack/react-query";
import waitlistService from "@/lib/services/waitlist-service";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";

export const useWaitlistActions = () => {
  const joinWaitlist = useMutation({
    mutationFn: waitlistService.joinWaitlist,
    onSuccess: () => toast.success("You're on the waitlist!"),
    onError: (error) => handleError(error, "Failed to join waitlist"),
  });

  return { joinWaitlist };
};
