import { useMutation } from "@tanstack/react-query";
import userService from "@/lib/services/user-service";
import { IUser } from "@/lib/types/user";
import { useAuth } from "../auth/use-auth";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";

export const useUserActions = () => {
  const { uid } = useAuth();
  const updateUser = useMutation({
    mutationFn: userService.updateUser,
    onSuccess: () => {
      toast.success("Changes saved successfully");
    },
    onError: (error) => {
      handleError(error, "Failed to save changes ");
    },
  });

  return {
    updateUser,
  };
};
