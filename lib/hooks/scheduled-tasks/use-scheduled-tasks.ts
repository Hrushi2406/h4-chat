import { useQuery } from "@tanstack/react-query";
import scheduledTaskService from "@/lib/services/scheduled-task-service";
import { useAuth } from "@/lib/hooks/auth/use-auth";

export const scheduledTaskKeys = {
  all: ["scheduled-tasks"] as const,
  list: (userId?: string) => [...scheduledTaskKeys.all, "list", userId] as const,
  runs: (taskId?: string) => [...scheduledTaskKeys.all, "runs", taskId] as const,
};

export const useScheduledTasks = () => {
  const { uid } = useAuth();

  return useQuery({
    queryKey: scheduledTaskKeys.list(uid),
    queryFn: () => scheduledTaskService.getTasks(),
    enabled: !!uid,
    refetchOnMount: "always",
  });
};

export const useScheduledTaskRuns = (taskId?: string) =>
  useQuery({
    queryKey: scheduledTaskKeys.runs(taskId),
    queryFn: () => scheduledTaskService.getRuns(taskId!),
    enabled: !!taskId,
  });
