import { useAuth } from "../auth/use-auth";
import { useQuery } from "@tanstack/react-query";
import userService from "@/lib/services/user-service";

export const useUser = () => {
  const { uid } = useAuth();
  return useQuery({
    queryKey: ["users", uid],
    queryFn: () => userService.getUserInfo(uid!),
    enabled: !!uid,
  });
};
