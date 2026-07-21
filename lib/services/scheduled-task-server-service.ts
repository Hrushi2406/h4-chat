import { generateText, stepCountIs, type ToolSet } from "ai";
import { v4 } from "uuid";
import { getDefaultModel, getModelById } from "@/lib/available-models";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";
import { getQstashClient } from "@/lib/clients/qstash";
import {
  getComposioSessionTools,
  isComposioConfigured,
} from "@/lib/composio";
import { closeMcpClients, createMcpToolContext } from "@/lib/mcp";
import { getUserMcpServersFromFirestore } from "@/lib/mcp-firestore";
import {
  COMPOSIO_META_TOOLS,
  COMPOSIO_TOOLKIT_EXAMPLES,
  COMPOSIO_TOOL_NAME_PATTERN,
} from "@/lib/types/composio-tool-slugs";
import {
  generateDefaultUserMessage,
  serializeThreadMessageForFirestore,
  type ThreadMessage,
} from "@/lib/types/thread";
import {
  normalizeScheduledTask,
  normalizeScheduledTaskRun,
  type ScheduledTask,
  type ScheduledTaskRun,
  type ScheduledTaskSource,
} from "@/lib/types/scheduled-task";
import { normalizeTaskCron } from "@/lib/scheduled-tasks/schedule-utils";

const colTasks = "scheduledTasks";
const colRuns = "scheduledTaskRuns";
const colThreads = "threads";

const getQstashScheduleId = (taskId: string) => `scheduled-task-${taskId}`;

export interface CreateScheduledTaskInput {
  userId: string;
  title: string;
  instruction: string;
  cron: string;
  timezone?: string;
  humanText?: string;
  source?: ScheduledTaskSource;
  sourceThreadId?: string;
  modelId?: string;
  baseUrl: string;
}

export interface UpdateScheduledTaskInput {
  taskId: string;
  userId: string;
  title?: string;
  instruction?: string;
  cron?: string;
  timezone?: string;
  humanText?: string;
  status?: "active" | "paused";
  modelId?: string;
  baseUrl: string;
}

export interface RunScheduledTaskInput {
  taskId: string;
  userId?: string;
  trigger: "manual" | "schedule";
  baseUrl: string;
}

const getDbOrThrow = () => {
  const db = getAdminFirestore();

  if (!db) {
    throw new Error("Firestore admin is not configured");
  }

  return db;
};

const removeUndefinedValues = <T>(value: T): T => {
  if (value === undefined) return undefined as T;
  if (value === null || value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => removeUndefinedValues(item)) as T;
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefinedValues(item)]),
    ) as T;
  }

  return value;
};

class ScheduledTaskServerService {
  async listTasksForUser(userId: string): Promise<ScheduledTask[]> {
    const db = getDbOrThrow();
    const snapshot = await db
      .collection(colTasks)
      .where("userId", "==", userId)
      .where("status", "in", ["active", "paused"])
      .get();

    return snapshot.docs
      .map((taskDoc) =>
        normalizeScheduledTask({
          ...(taskDoc.data() as ScheduledTask),
          id: taskDoc.id,
        }),
      )
      .sort((a, b) => {
        const createdAtDifference =
          b.createdAt.getTime() - a.createdAt.getTime();

        return createdAtDifference || b.id.localeCompare(a.id);
      });
  }

  async listRunsForTask({
    taskId,
    userId,
    pageSize = 20,
  }: {
    taskId: string;
    userId: string;
    pageSize?: number;
  }): Promise<ScheduledTaskRun[]> {
    const db = getDbOrThrow();
    await this.getTaskForUser(taskId, userId);

    const snapshot = await db
      .collection(colRuns)
      .where("taskId", "==", taskId)
      .orderBy("startedAt", "desc")
      .limit(pageSize)
      .get();

    return snapshot.docs.map((runDoc) =>
      normalizeScheduledTaskRun({
        ...(runDoc.data() as ScheduledTaskRun),
        id: runDoc.id,
      }),
    );
  }

  async createTask(input: CreateScheduledTaskInput): Promise<ScheduledTask> {
    const db = getDbOrThrow();
    const taskId = v4();
    const now = new Date().toISOString();
    const taskRef = db.collection(colTasks).doc(taskId);
    const schedule = normalizeTaskCron({
      cron: input.cron,
      timezone: input.timezone,
    });

    const task: ScheduledTask = {
      id: taskId,
      userId: input.userId,
      title: input.title.trim(),
      instruction: input.instruction.trim(),
      schedule: {
        humanText: input.humanText?.trim() || input.cron,
        cron: schedule.cron,
        timezone: schedule.timezone,
      },
      status: "active",
      source: input.source ?? "manual",
      sourceThreadId: input.sourceThreadId,
      modelId: input.modelId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    const persistedTask = {
      ...task,
      createdAt: now,
      updatedAt: now,
    };

    let qstashScheduleId: string | undefined;

    try {
      await taskRef.set(removeUndefinedValues(persistedTask));

      qstashScheduleId = await this.upsertQstashSchedule({
        taskId,
        cron: task.schedule.cron,
        baseUrl: input.baseUrl,
      });

      if (qstashScheduleId) {
        await taskRef.update({
          qstashScheduleId,
          updatedAt: now,
        });
      }
    } catch (error) {
      if (qstashScheduleId) {
        await this.deleteQstashSchedule(qstashScheduleId);
      }

      await taskRef.delete().catch((deleteError) => {
        console.error("Failed to clean up partial automation:", deleteError);
      });

      throw error;
    }

    return normalizeScheduledTask({
      ...persistedTask,
      qstashScheduleId,
    });
  }

  async updateTask(input: UpdateScheduledTaskInput): Promise<ScheduledTask> {
    const db = getDbOrThrow();
    const taskRef = db.collection(colTasks).doc(input.taskId);
    const task = await this.getTaskForUser(input.taskId, input.userId);
    const nextCron =
      input.cron || input.timezone
        ? normalizeTaskCron({
            cron: input.cron ?? task.schedule.cron,
            timezone: input.timezone ?? task.schedule.timezone,
          })
        : task.schedule;
    const nextStatus = input.status ?? task.status;
    let qstashScheduleId = task.qstashScheduleId;

    const update = removeUndefinedValues({
      title: input.title?.trim(),
      instruction: input.instruction?.trim(),
      modelId: input.modelId,
      status: nextStatus,
      qstashScheduleId,
      schedule:
        input.cron || input.timezone || input.humanText
          ? {
              humanText:
                input.humanText?.trim() ||
                task.schedule.humanText ||
                nextCron.cron,
              cron: nextCron.cron,
              timezone: nextCron.timezone,
            }
          : undefined,
      updatedAt: new Date().toISOString(),
      lastError: nextStatus === "active" ? null : task.lastError,
    });

    try {
      if (nextStatus === "active") {
        const nextQstashScheduleId = await this.upsertQstashSchedule({
          taskId: input.taskId,
          cron: nextCron.cron,
          baseUrl: input.baseUrl,
        });

        if (nextQstashScheduleId) {
          qstashScheduleId = nextQstashScheduleId;
          update.qstashScheduleId = qstashScheduleId;
        }
      } else if (nextStatus === "paused" && qstashScheduleId) {
        await getQstashClient()?.schedules.pause({ schedule: qstashScheduleId });
      }

      await taskRef.update(update);
    } catch (error) {
      await this.restoreQstashScheduleState(task, input.baseUrl);
      throw error;
    }

    const updatedSnapshot = await taskRef.get();
    return normalizeScheduledTask({
      ...(updatedSnapshot.data() as ScheduledTask),
      id: updatedSnapshot.id,
    });
  }

  async deleteTask(taskId: string, userId: string) {
    const db = getDbOrThrow();
    const task = await this.getTaskForUser(taskId, userId);

    if (task.qstashScheduleId) {
      await getQstashClient()?.schedules.delete(task.qstashScheduleId);
    }

    await db.collection(colTasks).doc(taskId).update({
      status: "deleted",
      updatedAt: new Date().toISOString(),
    });
  }

  async runTask(input: RunScheduledTaskInput): Promise<ScheduledTaskRun> {
    const db = getDbOrThrow();
    const task = input.userId
      ? await this.getTaskForUser(input.taskId, input.userId)
      : await this.getTask(input.taskId);

    if (task.status !== "active" && input.trigger === "schedule") {
      throw new Error("Automation is not active");
    }

    const runId = v4();
    const startedAt = new Date().toISOString();
    const runRef = db.collection(colRuns).doc(runId);

    await runRef.set({
      id: runId,
      taskId: task.id,
      userId: task.userId,
      status: "running",
      trigger: input.trigger,
      startedAt,
    });

    try {
      const output = await this.executeTaskInstruction(task, input.baseUrl);
      const threadId = await this.createOutputThread({
        task,
        runId,
        output,
        trigger: input.trigger,
      });
      const finishedAt = new Date().toISOString();
      const outputPreview = output.slice(0, 280);

      await runRef.update({
        status: "succeeded",
        finishedAt,
        outputThreadId: threadId,
        outputPreview,
      });

      await db.collection(colTasks).doc(task.id).update({
        lastRunAt: finishedAt,
        lastRunId: runId,
        lastOutputPreview: outputPreview,
        lastError: null,
        updatedAt: finishedAt,
      });

      return {
        id: runId,
        taskId: task.id,
        userId: task.userId,
        status: "succeeded",
        trigger: input.trigger,
        startedAt: new Date(startedAt),
        finishedAt: new Date(finishedAt),
        outputThreadId: threadId,
        outputPreview,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Automation failed";
      const finishedAt = new Date().toISOString();

      await runRef.update({
        status: "failed",
        finishedAt,
        error: message,
      });
      await db.collection(colTasks).doc(task.id).update({
        status: "failed",
        lastRunAt: finishedAt,
        lastRunId: runId,
        lastError: message,
        updatedAt: finishedAt,
      });

      throw error;
    }
  }

  async getTaskForUser(taskId: string, userId: string) {
    const task = await this.getTask(taskId);

    if (task.userId !== userId) {
      throw new Error("Forbidden");
    }

    return task;
  }

  private async getTask(taskId: string) {
    const db = getDbOrThrow();
    const snapshot = await db.collection(colTasks).doc(taskId).get();

    if (!snapshot.exists) {
      throw new Error("Automation not found");
    }

    return normalizeScheduledTask({
      ...(snapshot.data() as ScheduledTask),
      id: snapshot.id,
    });
  }

  private async upsertQstashSchedule({
    taskId,
    cron,
    baseUrl,
  }: {
    taskId: string;
    cron: string;
    baseUrl: string;
  }) {
    const client = getQstashClient();

    if (!client) {
      return undefined;
    }

    const scheduleId = getQstashScheduleId(taskId);

    await client.schedules.create({
      destination: `${baseUrl}/api/scheduled-tasks/execute`,
      scheduleId,
      cron,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ taskId }),
      retries: 2,
      label: scheduleId,
    });

    return scheduleId;
  }

  private async deleteQstashSchedule(scheduleId: string) {
    try {
      await getQstashClient()?.schedules.delete(scheduleId);
    } catch (error) {
      console.error("Failed to delete QStash schedule:", error);
    }
  }

  private async restoreQstashScheduleState(task: ScheduledTask, baseUrl: string) {
    const scheduleId = task.qstashScheduleId ?? getQstashScheduleId(task.id);
    const client = getQstashClient();

    if (!client) {
      return;
    }

    try {
      if (!task.qstashScheduleId) {
        await client.schedules.delete(scheduleId);
        return;
      }

      await this.upsertQstashSchedule({
        taskId: task.id,
        cron: task.schedule.cron,
        baseUrl,
      });

      if (task.status === "active") {
        await client.schedules.resume({ schedule: scheduleId });
      } else {
        await client.schedules.pause({ schedule: scheduleId });
      }
    } catch (error) {
      console.error("Failed to restore QStash schedule state:", error);
    }
  }

  private async executeTaskInstruction(task: ScheduledTask, baseUrl: string) {
    const model = getModelById(task.modelId ?? "") ?? getDefaultModel();
    const mcpServers = await getUserMcpServersFromFirestore({
      userId: task.userId,
    });
    const [composioTools, mcpContext] = await Promise.all([
      getScheduledComposioTools(task.userId, baseUrl),
      createMcpToolContext(task.userId, mcpServers),
    ]);
    const tools = {
      ...composioTools,
      ...mcpContext?.tools,
    } satisfies ToolSet;

    try {
      const result = await generateText({
        model: model.id,
        system: getScheduledTaskSystemPrompt(Boolean(composioTools), mcpContext?.servers),
        messages: [
          {
            role: "user",
            content: `Run this automation now.\n\nAutomation title: ${task.title}\nSchedule: ${task.schedule.humanText}\nInstruction:\n${task.instruction}`,
          },
        ],
        tools,
        stopWhen: stepCountIs(100),
      });

      return result.text || "The automation finished without a text response.";
    } finally {
      await closeMcpClients(mcpContext?.clients ?? []);
    }
  }

  private async createOutputThread({
    task,
    runId,
    output,
    trigger,
  }: {
    task: ScheduledTask;
    runId: string;
    output: string;
    trigger: "manual" | "schedule";
  }) {
    const db = getDbOrThrow();
    const threadId = v4();
    const now = new Date().toISOString();
    const prompt = generateDefaultUserMessage(
      `Automation run: ${task.title}\n\n${task.instruction}`,
    );
    const assistantMessage: ThreadMessage = {
      id: v4(),
      role: "assistant",
      content: output,
      parts: [{ type: "text", text: output }],
      createdAt: new Date(),
      updatedAt: now,
    };

    await db.collection(colThreads).doc(threadId).set(
      removeUndefinedValues({
        id: threadId,
        title: `${task.title} - ${trigger === "manual" ? "test run" : "automatic run"}`,
        userId: task.userId,
        createdAt: now,
        updatedAt: now,
        messageCount: 2,
        lastMessagePreview: output.slice(0, 100),
        scheduledTaskId: task.id,
        scheduledTaskRunId: runId,
        messages: [
          serializeThreadMessageForFirestore(prompt),
          serializeThreadMessageForFirestore(assistantMessage),
        ],
      }),
    );

    return threadId;
  }
}

async function getScheduledComposioTools(userId: string, baseUrl: string) {
  if (!isComposioConfigured()) {
    return undefined;
  }

  try {
    return await getComposioSessionTools(userId, {
      callbackUrl: `${baseUrl}/api/composio/callback`,
      authContext: {
        baseUrl,
        source: "automations",
      },
    });
  } catch (error) {
    console.error("Failed to load automation Composio tools:", error);
    return undefined;
  }
}

function getScheduledTaskSystemPrompt(
  composioEnabled: boolean,
  mcpServers:
    | Array<{
        id: string;
        name: string;
        instructions?: string;
        toolNames: string[];
      }>
    | undefined,
) {
  return `You are Sakhi executing an automation for the user. Complete the task directly and return a concise result summary in markdown.

Guidelines:
- This is an unattended automation run. Do not ask follow-up questions.
- If a required connection or permission is missing, explain exactly what is missing.
- Never perform irreversible external actions such as sending messages, emails, social posts, purchases, payments, deleting data, or changing external records unless the task instruction explicitly says this task is allowed to do that exact action.
- Prefer summaries, drafts, and links to records you created or inspected.
${
  composioEnabled
    ? `- Connected-app tool names follow ${COMPOSIO_TOOL_NAME_PATTERN}. Discover tools with ${COMPOSIO_META_TOOLS.SEARCH_TOOLS}; examples include ${COMPOSIO_TOOLKIT_EXAMPLES.join(", ")}.`
    : ""
}
${
  mcpServers?.length
    ? `- Available MCP servers:\n${mcpServers
        .map(
          (server) =>
            `  - ${server.name} (${server.id}): ${server.toolNames.join(", ")}${
              server.instructions ? `\n    ${server.instructions}` : ""
            }`,
        )
        .join("\n")}`
    : ""
}`;
}

const scheduledTaskServerService = new ScheduledTaskServerService();
export default scheduledTaskServerService;
