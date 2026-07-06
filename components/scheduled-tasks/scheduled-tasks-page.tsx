"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  ChevronDown,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Modal from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  useScheduledTaskRuns,
  useScheduledTasks,
} from "@/lib/hooks/scheduled-tasks/use-scheduled-tasks";
import { useScheduledTaskActions } from "@/lib/hooks/scheduled-tasks/use-scheduled-task-actions";
import {
  DEFAULT_TASK_TIMEZONE,
  buildDailyCron,
  buildIntervalCron,
  buildWeeklyCron,
  getCronSummary,
  normalizeTaskTimezone,
  stripCronTimezone,
} from "@/lib/scheduled-tasks/schedule-utils";
import type {
  ScheduledTask,
  ScheduledTaskRun,
} from "@/lib/types/scheduled-task";
import { cn, navToolbarSecondaryBtnClass } from "@/lib/utils";

const cardClass = "rounded-3xl border bg-muted/30 dark:bg-muted-foreground/5";
const controlClass = "rounded-full shadow-xs";
const pillClass = "rounded-full";

type ScheduleMode = "daily" | "weekly" | "interval" | "custom";

const SCHEDULE_MODES: { value: ScheduleMode; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "interval", label: "Every few hours" },
  { value: "custom", label: "Advanced" },
];

type TaskFormState = {
  title: string;
  instruction: string;
  mode: ScheduleMode;
  time: string;
  dayOfWeek: string;
  everyHours: string;
  customCron: string;
  timezone: string;
};

const defaultFormState = (): TaskFormState => ({
  title: "",
  instruction: "",
  mode: "daily",
  time: "20:00",
  dayOfWeek: "1",
  everyHours: "6",
  customCron: "0 20 * * *",
  timezone: normalizeTaskTimezone(
    Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TASK_TIMEZONE,
  ),
});

const buildCreateFromChatDraft = (form: TaskFormState, humanText: string) => {
  const taskText =
    form.instruction.trim() || form.title.trim() || "a new automation";

  return `Help me create an automation for this: ${taskText}\nSchedule: ${humanText}.`;
};

export default function ScheduledTasksPage() {
  const {
    data: tasks = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useScheduledTasks();
  const actions = useScheduledTaskActions();
  const [expandedId, setExpandedId] = useState<string | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | undefined>();
  const [taskToDelete, setTaskToDelete] = useState<ScheduledTask | undefined>();

  const activeCount = tasks.filter((task) => task.status === "active").length;

  const openCreateDialog = () => {
    setEditingTask(undefined);
    setIsFormOpen(true);
  };

  const openEditDialog = (task: ScheduledTask) => {
    setEditingTask(task);
    setIsFormOpen(true);
  };

  const handleRunNow = async (task: ScheduledTask) => {
    await actions.runTask.mutateAsync(task.id);
    toast.success("Automation run finished");
    setExpandedId(task.id);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Automations
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tasks.length === 0
                ? "Let Sakhi run things for you automatically"
                : `${tasks.length} automation${tasks.length === 1 ? "" : "s"} · ${activeCount} active`}
            </p>
          </div>
          <Button onClick={openCreateDialog} className={pillClass}>
            <Plus className="h-4 w-4" />
            New automation
          </Button>
        </div>

        {isLoading ? (
          <TaskListSkeleton />
        ) : isError ? (
          <LoadError
            message={
              error instanceof Error
                ? error.message
                : "Unable to load automations"
            }
            onRetry={() => void refetch()}
          />
        ) : tasks.length === 0 ? (
          <EmptyTasks onCreate={openCreateDialog} />
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isExpanded={expandedId === task.id}
                onToggle={() =>
                  setExpandedId((current) =>
                    current === task.id ? undefined : task.id,
                  )
                }
                isRunning={actions.runTask.isPending}
                isUpdating={actions.updateTask.isPending}
                onRunNow={() => {
                  handleRunNow(task).catch(() => undefined);
                }}
                onEdit={() => openEditDialog(task)}
                onDelete={() => setTaskToDelete(task)}
                onToggleStatus={() =>
                  actions.updateTask.mutate({
                    taskId: task.id,
                    status: task.status === "active" ? "paused" : "active",
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      <TaskFormModal
        open={isFormOpen}
        task={editingTask}
        onOpenChange={setIsFormOpen}
        onSubmit={async (payload) => {
          if (editingTask) {
            await actions.updateTask.mutateAsync({
              taskId: editingTask.id,
              ...payload,
            });
            toast.success("Automation updated");
          } else {
            const task = await actions.createTask.mutateAsync(payload);
            setExpandedId(task.id);
            toast.success("Automation created");
          }

          setIsFormOpen(false);
        }}
        isSaving={actions.createTask.isPending || actions.updateTask.isPending}
      />

      <ConfirmationDialog
        open={Boolean(taskToDelete)}
        title="Delete this automation?"
        description="The schedule stops and the automation is removed from this list. Past run outputs stay in your chats."
        confirmLabel="Delete"
        isConfirming={actions.deleteTask.isPending}
        onCancel={() => setTaskToDelete(undefined)}
        onConfirm={() => {
          if (!taskToDelete) return;
          actions.deleteTask
            .mutateAsync(taskToDelete.id)
            .then(() => {
              setTaskToDelete(undefined);
              toast.success("Automation deleted");
            })
            .catch(() => undefined);
        }}
      />
    </div>
  );
}

function TaskCard({
  task,
  isExpanded,
  onToggle,
  isRunning,
  isUpdating,
  onRunNow,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  task: ScheduledTask;
  isExpanded: boolean;
  onToggle: () => void;
  isRunning: boolean;
  isUpdating: boolean;
  onRunNow: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}) {
  const scheduleSummary = getCronSummary(
    stripCronTimezone(task.schedule.cron),
    task.schedule.humanText,
  );

  return (
    <div className={cardClass}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3.5 px-5 py-[1.125rem] text-left"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <p className="truncate leading-5">{task.title}</p>
              {task.status === "paused" && (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500">
                  Paused
                </span>
              )}
            </div>
            <span className="max-w-[48%] shrink-0 truncate text-xs leading-5 text-muted-foreground">
              Runs {scheduleSummary}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-3.5">
            <p className="line-clamp-1 min-w-0 max-w-[80%] text-sm leading-5 text-muted-foreground">
              {task.instruction}
            </p>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                isExpanded && "rotate-180",
              )}
            />
          </div>
        </div>
      </button>

      {isExpanded ? (
        <div className="space-y-5 border-t px-4 pb-4 pt-4">
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {task.instruction}
          </p>

          <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-3 sm:flex sm:flex-wrap sm:items-center">
            <Button
              variant="secondary"
              size="sm"
              className={cn(
                navToolbarSecondaryBtnClass,
                "w-full min-w-0 gap-1.5 px-3 sm:w-auto",
              )}
              onClick={onRunNow}
              disabled={isRunning}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4" />
              )}
              Run now
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={cn(
                navToolbarSecondaryBtnClass,
                "w-full min-w-0 gap-1.5 px-3 sm:w-auto",
              )}
              onClick={onToggleStatus}
              disabled={isUpdating}
            >
              {task.status === "active" ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {task.status === "active" ? "Pause" : "Resume"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={cn(
                navToolbarSecondaryBtnClass,
                "w-full min-w-0 gap-1.5 px-3 sm:w-auto",
              )}
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className={cn(
                navToolbarSecondaryBtnClass,
                "col-span-2 w-8 justify-self-end hover:text-destructive min-[380px]:col-span-3 sm:col-span-1 sm:ml-auto",
              )}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete automation</span>
            </Button>
          </div>

          <TaskRuns taskId={task.id} />
        </div>
      ) : null}
    </div>
  );
}

function TaskRuns({ taskId }: { taskId: string }) {
  const { data: runs = [], isLoading } = useScheduledTaskRuns(taskId);

  if (isLoading) {
    return (
      <div className="h-16 animate-pulse rounded-2xl border bg-muted/30" />
    );
  }

  if (!runs.length) {
    return (
      <p className="text-xs text-muted-foreground">
        No runs yet. Use Run now to test it.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Recent runs
      </p>
      <div className="overflow-hidden rounded-2xl border bg-background">
        {runs.slice(0, 5).map((run, index) => (
          <RunRow key={run.id} run={run} isFirst={index === 0} />
        ))}
      </div>
    </div>
  );
}

function RunRow({ run, isFirst }: { run: ScheduledTaskRun; isFirst: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        !isFirst && "border-t",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-5">
          {RUN_TRIGGER_LABEL[run.trigger]}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {RUN_STATUS_TEXT[run.status]} · {formatRunTime(run.startedAt)}
        </p>
        {run.status === "failed" && run.error ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-destructive">
            {run.error}
          </p>
        ) : null}
      </div>
      {run.outputThreadId ? (
        <Button
          asChild
          variant="outline"
          size="sm"
          className={cn(pillClass, "shrink-0 text-xs shadow-none")}
        >
          <Link href={`/chat/${run.outputThreadId}`}>Open</Link>
        </Button>
      ) : null}
    </div>
  );
}

const RUN_TRIGGER_LABEL: Record<ScheduledTaskRun["trigger"], string> = {
  manual: "Test run",
  schedule: "Automatic run",
};

const RUN_STATUS_TEXT: Record<ScheduledTaskRun["status"], string> = {
  succeeded: "Ran successfully",
  failed: "Run failed",
  running: "Running…",
};

function TaskFormModal({
  open,
  task,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  task?: ScheduledTask;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    title: string;
    instruction: string;
    cron: string;
    timezone: string;
    humanText: string;
  }) => Promise<void>;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<TaskFormState>(defaultFormState);

  useEffect(() => {
    if (!open) return;

    if (!task) {
      setForm(defaultFormState());
      return;
    }

    setForm({
      title: task.title,
      instruction: task.instruction,
      mode: "custom",
      time: "20:00",
      dayOfWeek: "1",
      everyHours: "6",
      customCron: stripCronTimezone(task.schedule.cron),
      timezone: task.schedule.timezone,
    });
  }, [open, task]);

  const cron = useMemo(() => buildCronFromForm(form), [form]);
  const humanText = getCronSummary(cron, form.customCron);
  const createFromChatHref = useMemo(
    () => ({
      pathname: "/chat",
      query: {
        draft: buildCreateFromChatDraft(form, humanText),
      },
    }),
    [form, humanText],
  );

  const updateForm = <K extends keyof TaskFormState>(
    key: K,
    value: TaskFormState[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <Modal
      isOpen={open}
      closeModal={() => onOpenChange(false)}
      size="lg"
      className="max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-none dark:bg-card"
      clickOutsideToClose={!isSaving}
    >
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold tracking-tight">
              {task ? "Edit automation" : "New automation"}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Tell Sakhi what to do and how often to do it. It runs on its own
              and saves each result to your chats.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full text-muted-foreground"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Name</Label>
            <Input
              id="task-title"
              value={form.title}
              onChange={(event) => updateForm("title", event.target.value)}
              placeholder="Morning email summary"
              className={controlClass}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-instruction">What should Sakhi do?</Label>
            <Textarea
              id="task-instruction"
              value={form.instruction}
              onChange={(event) =>
                updateForm("instruction", event.target.value)
              }
              rows={4}
              placeholder="Summarize my unread important emails and list the top things I need to follow up on."
              className="rounded-3xl text-sm shadow-xs"
            />
          </div>

          <div className="space-y-2">
            <Label>How often?</Label>
            <div className="flex flex-wrap gap-1.5">
              {SCHEDULE_MODES.map((mode) => (
                <Button
                  key={mode.value}
                  type="button"
                  variant={form.mode === mode.value ? "default" : "secondary"}
                  size="sm"
                  className={pillClass}
                  onClick={() => updateForm("mode", mode.value)}
                >
                  {mode.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {form.mode === "weekly" ? (
              <div className="space-y-2">
                <Label htmlFor="task-day">Day</Label>
                <Select
                  value={form.dayOfWeek}
                  onValueChange={(value) => updateForm("dayOfWeek", value)}
                >
                  <SelectTrigger
                    id="task-day"
                    className={cn("w-full", controlClass)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="2">Tuesday</SelectItem>
                    <SelectItem value="3">Wednesday</SelectItem>
                    <SelectItem value="4">Thursday</SelectItem>
                    <SelectItem value="5">Friday</SelectItem>
                    <SelectItem value="6">Saturday</SelectItem>
                    <SelectItem value="0">Sunday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {form.mode === "daily" || form.mode === "weekly" ? (
              <div className="space-y-2">
                <Label htmlFor="task-time">Time</Label>
                <Input
                  id="task-time"
                  type="time"
                  value={form.time}
                  onChange={(event) => updateForm("time", event.target.value)}
                  className={controlClass}
                />
              </div>
            ) : null}

            {form.mode === "interval" ? (
              <div className="space-y-2">
                <Label htmlFor="task-hours">Run every</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="task-hours"
                    type="number"
                    min="1"
                    max="23"
                    value={form.everyHours}
                    onChange={(event) =>
                      updateForm("everyHours", event.target.value)
                    }
                    className={cn(controlClass, "w-20")}
                  />
                  <span className="text-sm text-muted-foreground">hours</span>
                </div>
              </div>
            ) : null}

            {form.mode === "custom" ? (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="task-cron">Schedule (cron)</Label>
                  <Input
                    id="task-cron"
                    value={form.customCron}
                    onChange={(event) =>
                      updateForm("customCron", event.target.value)
                    }
                    placeholder="0 20 * * *"
                    className={cn(controlClass, "font-mono")}
                  />
                  <p className="text-xs text-muted-foreground">
                    For custom timings. Stick with the simpler options above if
                    you&apos;re not sure.
                  </p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="task-timezone">Timezone</Label>
                  <Input
                    id="task-timezone"
                    value={form.timezone}
                    onChange={(event) =>
                      updateForm("timezone", event.target.value)
                    }
                    placeholder="Asia/Kolkata"
                    className={controlClass}
                  />
                </div>
              </>
            ) : null}
          </div>

          <div className="rounded-2xl bg-muted/50 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{humanText}</span>
            </div>
            {form.mode !== "custom" ? (
              <p className="mt-1 pl-6 text-xs text-muted-foreground">
                Times use your timezone ({form.timezone}).
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {!task ? (
            <Button
              asChild
              variant="secondary"
              size="sm"
              className={cn(navToolbarSecondaryBtnClass, "justify-center")}
            >
              <Link href={createFromChatHref}>Create using chat</Link>
            </Button>
          ) : (
            <div />
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              className={pillClass}
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={navToolbarSecondaryBtnClass}
              onClick={() => {
                onSubmit({
                  title: form.title,
                  instruction: form.instruction,
                  cron,
                  timezone: normalizeTaskTimezone(form.timezone),
                  humanText,
                }).catch(() => undefined);
              }}
              disabled={
                isSaving || !form.title.trim() || !form.instruction.trim()
              }
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {task ? "Save changes" : "Create automation"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function buildCronFromForm(form: TaskFormState) {
  const [hour = "20", minute = "0"] = form.time.split(":");
  const numericHour = Number(hour);
  const numericMinute = Number(minute);
  const timezone = normalizeTaskTimezone(form.timezone);

  if (form.mode === "weekly") {
    return buildWeeklyCron({
      dayOfWeek: Number(form.dayOfWeek),
      hour: numericHour,
      minute: numericMinute,
      timezone,
    });
  }

  if (form.mode === "interval") {
    return buildIntervalCron({
      everyHours: Math.max(1, Math.min(23, Number(form.everyHours) || 1)),
      timezone,
    });
  }

  if (form.mode === "custom") {
    return `CRON_TZ=${timezone} ${stripCronTimezone(form.customCron)}`;
  }

  return buildDailyCron({
    hour: numericHour,
    minute: numericMinute,
    timezone,
  });
}

function EmptyTasks({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className={cn(
        cardClass,
        "flex flex-col items-center justify-center px-6 py-14 text-center",
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CalendarClock className="h-6 w-6" />
      </div>
      <h2 className="font-medium">No automations</h2>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
        Set a task once and Sakhi runs it for you. Like &ldquo;send me a news summary every morning.&rdquo;
      </p>
      <Button className={cn(pillClass, "mt-5")} onClick={onCreate}>
        <Plus className="h-4 w-4" />
        New automation
      </Button>
    </div>
  );
}

function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className={cn(
        cardClass,
        "border-destructive/30 bg-destructive/5 px-5 py-4",
      )}
    >
      <p className="text-sm font-medium text-destructive">
        Could not load tasks
      </p>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        {message}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(pillClass, "mt-4")}
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  );
}

function TaskListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            cardClass,
            "px-5 py-[1.125rem]",
            index === 2 && "hidden sm:block",
          )}
        >
          <div className="space-y-2">
            <div className="flex min-w-0 items-center gap-4">
              <div
                className={cn(
                  "h-4 animate-pulse rounded-full bg-muted",
                  index === 0 && "w-44",
                  index === 1 && "w-36",
                  index === 2 && "w-52",
                )}
              />
              <div className="ml-auto h-3 w-28 animate-pulse rounded-full bg-muted/80" />
            </div>
            <div className="flex min-w-0 items-center gap-3.5">
              <div
                className={cn(
                  "h-3 animate-pulse rounded-full bg-muted/80",
                  index === 0 && "w-3/4",
                  index === 1 && "w-2/3",
                  index === 2 && "w-5/6",
                )}
              />
              <div className="ml-auto size-4 shrink-0 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusDot({
  className,
  status,
}: {
  className?: string;
  status: ScheduledTask["status"];
}) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        status === "active" && "bg-emerald-500",
        status === "paused" && "bg-amber-500",
        status === "failed" && "bg-destructive",
        status === "deleted" && "bg-muted-foreground",
        className,
      )}
    />
  );
}

function formatRunTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}
