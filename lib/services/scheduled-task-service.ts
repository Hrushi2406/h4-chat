import { auth } from "@/lib/clients/firebase";
import {
  normalizeScheduledTask,
  normalizeScheduledTaskRun,
  type ScheduledTask,
  type ScheduledTaskRun,
} from "@/lib/types/scheduled-task";

const getAuthToken = async () => {
  const token = await auth.currentUser?.getIdToken();

  if (!token) {
    throw new Error("Sign in is required");
  }

  return token;
};

class ScheduledTaskService {
  async getTasks(): Promise<ScheduledTask[]> {
    const response = await fetch("/api/scheduled-tasks", {
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    const body = (await response.json()) as { tasks: ScheduledTask[] };
    return body.tasks.map(normalizeScheduledTask);
  }

  async getRuns(taskId: string): Promise<ScheduledTaskRun[]> {
    if (!taskId) {
      return [];
    }

    const response = await fetch(`/api/scheduled-tasks/${taskId}/runs`, {
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    const body = (await response.json()) as { runs: ScheduledTaskRun[] };
    return body.runs.map(normalizeScheduledTaskRun);
  }

  async createTask(input: {
    title: string;
    instruction: string;
    cron: string;
    timezone: string;
    humanText: string;
    modelId?: string;
  }) {
    const response = await fetch("/api/scheduled-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        authToken: await getAuthToken(),
      }),
    });

    return readTaskResponse(response);
  }

  async updateTask(input: {
    taskId: string;
    title?: string;
    instruction?: string;
    cron?: string;
    timezone?: string;
    humanText?: string;
    status?: "active" | "paused";
    modelId?: string;
  }) {
    const { taskId, ...payload } = input;
    const response = await fetch(`/api/scheduled-tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        authToken: await getAuthToken(),
      }),
    });

    return readTaskResponse(response);
  }

  async deleteTask(taskId: string) {
    const response = await fetch(`/api/scheduled-tasks/${taskId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authToken: await getAuthToken() }),
    });

    if (!response.ok) {
      throw new Error(await readError(response));
    }
  }

  async runTask(taskId: string) {
    const response = await fetch(`/api/scheduled-tasks/${taskId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authToken: await getAuthToken() }),
    });

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    const body = (await response.json()) as { run: ScheduledTaskRun };
    return normalizeScheduledTaskRun(body.run);
  }
}

async function readTaskResponse(response: Response) {
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const body = (await response.json()) as { task: ScheduledTask };
  return normalizeScheduledTask(body.task);
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || "Scheduled task request failed";
  } catch {
    return "Scheduled task request failed";
  }
}

const scheduledTaskService = new ScheduledTaskService();
export default scheduledTaskService;
