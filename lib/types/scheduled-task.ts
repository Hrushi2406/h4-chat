import type { Timestamp } from "firebase/firestore";

export type ScheduledTaskStatus = "active" | "paused" | "failed" | "deleted";
export type ScheduledTaskSource = "manual" | "chat";
export type ScheduledTaskRunStatus = "running" | "succeeded" | "failed";

export interface ScheduledTaskSchedule {
  humanText: string;
  cron: string;
  timezone: string;
}

export interface ScheduledTask {
  id: string;
  userId: string;
  title: string;
  instruction: string;
  schedule: ScheduledTaskSchedule;
  status: ScheduledTaskStatus;
  source: ScheduledTaskSource;
  sourceThreadId?: string;
  qstashScheduleId?: string;
  modelId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastRunAt?: Date;
  nextRunAt?: Date;
  lastRunId?: string;
  lastOutputPreview?: string;
  lastError?: string;
}

export interface ScheduledTaskRun {
  id: string;
  taskId: string;
  userId: string;
  status: ScheduledTaskRunStatus;
  trigger: "manual" | "schedule";
  startedAt: Date;
  finishedAt?: Date;
  outputThreadId?: string;
  outputPreview?: string;
  error?: string;
}

export type FirestoreDate =
  | Date
  | string
  | number
  | Timestamp
  | { toDate: () => Date }
  | undefined
  | null;

export const normalizeScheduledDate = (date: FirestoreDate): Date | undefined => {
  if (!date) return undefined;
  if (date instanceof Date) return date;

  if (
    typeof date === "object" &&
    "toDate" in date &&
    typeof date.toDate === "function"
  ) {
    return date.toDate();
  }

  if (typeof date === "string" || typeof date === "number") {
    return new Date(date);
  }

  return undefined;
};

type ScheduledTaskFirestoreShape = Partial<
  Omit<ScheduledTask, "createdAt" | "updatedAt" | "lastRunAt" | "nextRunAt">
> & {
  id: string;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
  lastRunAt?: FirestoreDate;
  nextRunAt?: FirestoreDate;
};

type ScheduledTaskRunFirestoreShape = Partial<
  Omit<ScheduledTaskRun, "startedAt" | "finishedAt">
> & {
  id: string;
  startedAt?: FirestoreDate;
  finishedAt?: FirestoreDate;
};

export const normalizeScheduledTask = (
  task: ScheduledTaskFirestoreShape,
): ScheduledTask => {
  const now = new Date();

  return {
    id: task.id,
    userId: task.userId ?? "",
    title: task.title ?? "Untitled task",
    instruction: task.instruction ?? "",
    schedule: {
      humanText: task.schedule?.humanText ?? "",
      cron: task.schedule?.cron ?? "",
      timezone: task.schedule?.timezone ?? "UTC",
    },
    status: task.status ?? "active",
    source: task.source ?? "manual",
    sourceThreadId: task.sourceThreadId,
    qstashScheduleId: task.qstashScheduleId,
    modelId: task.modelId,
    createdAt: normalizeScheduledDate(task.createdAt) ?? now,
    updatedAt: normalizeScheduledDate(task.updatedAt) ?? now,
    lastRunAt: normalizeScheduledDate(task.lastRunAt),
    nextRunAt: normalizeScheduledDate(task.nextRunAt),
    lastRunId: task.lastRunId,
    lastOutputPreview: task.lastOutputPreview,
    lastError: task.lastError,
  };
};

export const normalizeScheduledTaskRun = (
  run: ScheduledTaskRunFirestoreShape,
): ScheduledTaskRun => {
  const now = new Date();

  return {
    id: run.id,
    taskId: run.taskId ?? "",
    userId: run.userId ?? "",
    status: run.status ?? "running",
    trigger: run.trigger ?? "manual",
    startedAt: normalizeScheduledDate(run.startedAt) ?? now,
    finishedAt: normalizeScheduledDate(run.finishedAt),
    outputThreadId: run.outputThreadId,
    outputPreview: run.outputPreview,
    error: run.error,
  };
};
