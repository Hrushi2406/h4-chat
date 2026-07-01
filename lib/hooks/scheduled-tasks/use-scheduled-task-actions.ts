import { useMutation, useQueryClient } from "@tanstack/react-query";
import scheduledTaskService from "@/lib/services/scheduled-task-service";
import { scheduledTaskKeys } from "@/lib/hooks/scheduled-tasks/use-scheduled-tasks";
import { handleError } from "@/lib/utils";

export const useScheduledTaskActions = () => {
  const qc = useQueryClient();

  const invalidateTasks = () => {
    void qc.invalidateQueries({ queryKey: scheduledTaskKeys.all });
  };

  const createTask = useMutation({
    mutationFn: scheduledTaskService.createTask,
    onSuccess: invalidateTasks,
    onError: (error) => handleError(error, "Failed to create automation"),
  });

  const updateTask = useMutation({
    mutationFn: scheduledTaskService.updateTask,
    onSuccess: invalidateTasks,
    onError: (error) => handleError(error, "Failed to update automation"),
  });

  const deleteTask = useMutation({
    mutationFn: scheduledTaskService.deleteTask,
    onSuccess: invalidateTasks,
    onError: (error) => handleError(error, "Failed to delete automation"),
  });

  const runTask = useMutation({
    mutationFn: scheduledTaskService.runTask,
    onSuccess: invalidateTasks,
    onError: (error) => handleError(error, "Failed to run automation"),
  });

  return {
    createTask,
    updateTask,
    deleteTask,
    runTask,
  };
};
