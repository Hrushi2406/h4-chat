import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getComposioSessionTools, isComposioConfigured } from "@/lib/composio";
import { createMcpToolContext } from "@/lib/mcp";
import { getUserMcpServersFromFirestore } from "@/lib/mcp-firestore";
import helperServerService from "@/lib/services/helper-server-service";
import scheduledTaskServerService from "@/lib/services/scheduled-task-server-service";
import { createPromptLink } from "@/lib/prompt-links-admin";
import { addUserMemory, deleteUserMemory, updateUserMemory } from "@/lib/user-memories-admin";
import { MAX_MEMORY_CONTENT_LENGTH, type IUser } from "@/lib/types/user";

export const getConversationProviderOptions = (modelId: string, userId: string) => ({
  providerOptions: {
    gateway: {
      ...(modelId === "deepseek/deepseek-v4-flash"
        ? { order: ["novita", "digitalocean", "deepseek", "fireworks"] }
        : {}),
      user: userId,
      tags: ["feature:chat"],
    },
  },
});

export const createServerConversationContext = async (input: {
  userId: string;
  threadId: string;
  modelId: string;
  baseUrl: string;
  channel: "web" | "whatsapp" | "automation";
  user: Partial<IUser>;
}) => {
  const [helpers, mcpServers, composioTools] = await Promise.all([
    helperServerService.getAvailableHelpers(input.userId).catch(() => []),
    getUserMcpServersFromFirestore({ userId: input.userId }).catch(() => []),
    isComposioConfigured()
      ? getComposioSessionTools(input.userId, {
          callbackUrl: `${input.baseUrl}/api/composio/callback`,
          skipStoredSessionRead: true,
          userComposioSessionId: input.user.composioSessionId,
          authContext: {
            baseUrl: input.baseUrl,
            source: "chat",
            threadId: input.threadId,
          },
        }).catch((error) => {
          console.error("Failed to load server conversation Composio tools", error);
          return undefined;
        })
      : undefined,
  ]);
  const mcpContext = await createMcpToolContext(input.userId, mcpServers);
  const helpersBySlug = new Map(helpers.map((helper) => [helper.slug, helper]));
  const tools = {
    get_scheduled_tasks: tool({
      description: "List the user's Sakhi automations.",
      inputSchema: z.object({}),
      execute: async () => ({
        tasks: (await scheduledTaskServerService.listTasksForUser(input.userId)).map((task) => ({
          taskId: task.id,
          title: task.title,
          schedule: task.schedule.humanText,
          status: task.status,
        })),
      }),
    }),
    create_scheduled_task: tool({
      description: "Create a recurring Sakhi automation after the user asks for a repeated schedule.",
      inputSchema: z.object({
        title: z.string().min(1),
        instruction: z.string().min(1),
        cron: z.string().min(1),
        timezone: z.string().min(1).default("Asia/Kolkata"),
        humanText: z.string().min(1),
      }),
      execute: async ({ title, instruction, cron, timezone, humanText }) => {
        const task = await scheduledTaskServerService.createTask({
          userId: input.userId,
          title,
          instruction,
          cron,
          timezone,
          humanText,
          source: "chat",
          sourceThreadId: input.threadId,
          modelId: input.modelId,
          notifyOnWhatsApp: input.channel === "whatsapp",
          baseUrl: input.baseUrl,
        });
        return { ok: true, taskId: task.id, schedule: task.schedule.humanText, notifyOnWhatsApp: task.notifyOnWhatsApp };
      },
    }),
    delete_scheduled_task: tool({
      description: "Delete an automation only after the user explicitly asks. Use its exact task ID.",
      inputSchema: z.object({ taskId: z.string().min(1) }),
      execute: async ({ taskId }) => {
        await scheduledTaskServerService.deleteTask(taskId, input.userId);
        return { ok: true, taskId };
      },
    }),
    save_memory: tool({
      description: "Save a durable user preference or fact worth recalling.",
      inputSchema: z.object({ content: z.string().min(1).max(MAX_MEMORY_CONTENT_LENGTH) }),
      execute: async ({ content }) => addUserMemory(input.userId, content),
    }),
    update_memory: tool({
      description: "Correct an existing durable memory.",
      inputSchema: z.object({ memory_id: z.string().min(1), content: z.string().min(1).max(MAX_MEMORY_CONTENT_LENGTH) }),
      execute: async ({ memory_id, content }) => updateUserMemory(input.userId, memory_id, content),
    }),
    delete_memory: tool({
      description: "Delete an existing durable memory.",
      inputSchema: z.object({ memory_id: z.string().min(1) }),
      execute: async ({ memory_id }) => deleteUserMemory(input.userId, memory_id),
    }),
    create_prompt_share_link: tool({
      description: "Create a Sakhi prompt sharing link.",
      inputSchema: z.object({ text: z.string().min(1).max(20_000), mode: z.enum(["draft", "prompt"]).default("draft") }),
      execute: async ({ text, mode }) => ({
        url: `${input.baseUrl}/p/${await createPromptLink({ text, mode, userId: input.userId })}`,
        mode,
      }),
    }),
    ...(helpers.length > 0
      ? {
          use_helper: tool({
            description: "Load a listed Sakhi Helper by its exact slug.",
            inputSchema: z.object({ slug: z.string().min(1).max(100) }),
            execute: async ({ slug }) => {
              const helper = helpersBySlug.get(slug);
              if (!helper) return { used: false, error: "Helper is unavailable" };
              await helperServerService.recordUsage(helper.id).catch(() => undefined);
              return { used: true, slug, title: helper.title, instructions: helper.instructions };
            },
          }),
        }
      : {}),
    ...composioTools,
    ...mcpContext?.tools,
  } satisfies ToolSet;

  const memoryLines = input.user.memoryEnabled === false
    ? []
    : (input.user.memories ?? []).map((memory) => `- [${memory.id}] ${memory.content}`);
  const helperLines = helpers.map((helper) => `- ${helper.slug}: ${helper.whenToUse}`);
  const system = `You are Sakhi, a trusted AI friend who helps people get things done. Answer directly and naturally, with concise formatting suitable for ${input.channel}.
Never perform irreversible or consequential external actions without showing the exact action and receiving explicit confirmation. Drafting is not permission to send. Never claim an action succeeded unless its tool result proves it.
Use connected-app and MCP tools when relevant. If authorization is needed, return the provided secure connection link and explain that the pending task can continue afterward.
Use automation tools for repeated schedules. Automations created on WhatsApp notify on WhatsApp by default. Use memory tools silently for durable facts. Use a Helper only by an exact listed slug.
${input.user.name ? `User name: ${input.user.name}` : ""}
${input.user.occupation ? `Occupation: ${input.user.occupation}` : ""}
${input.user.userPreferences ? `Preferences: ${input.user.userPreferences}` : ""}
${memoryLines.length ? `Memories:\n${memoryLines.join("\n")}` : ""}
${helperLines.length ? `Available Helpers:\n${helperLines.join("\n")}` : ""}`;

  return { tools, system, mcpClients: mcpContext?.clients ?? [] };
};
