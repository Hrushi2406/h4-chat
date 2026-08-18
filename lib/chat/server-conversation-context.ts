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
  channelMessageId?: string;
  user: Partial<IUser>;
}) => {
  const [helpers, mcpContext, composioTools] = await Promise.all([
    helperServerService.getAvailableHelpers(input.userId).catch(() => []),
    getUserMcpServersFromFirestore({ userId: input.userId })
      .catch(() => [])
      .then((mcpServers) => createMcpToolContext(input.userId, mcpServers)),
    isComposioConfigured()
      ? getComposioSessionTools(input.userId, {
          callbackUrl: `${input.baseUrl}/api/composio/callback`,
          skipStoredSessionRead: true,
          userComposioSessionId: input.user.composioSessionId,
          authContext: {
            baseUrl: input.baseUrl,
            source: "chat",
            threadId: input.threadId,
            channelMessageId: input.channelMessageId,
          },
        }).catch((error) => {
          console.error("Failed to load server conversation Composio tools", error);
          return undefined;
        })
      : undefined,
  ]);
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
  const actionPolicy = input.channel === "whatsapp"
    ? `Use tools directly when the request is clear. Send messages and replies without another confirmation; ask only for missing recipient or content.

WhatsApp engagement tool:
- You have a tool named WHATSAPP_SEND_PROGRESS_UPDATE.
- For any WhatsApp request that requires checking, searching, reading, summarizing, drafting, sending, or using any connected app/tool, your first action MUST be to call WHATSAPP_SEND_PROGRESS_UPDATE with a short status update.
- Call WHATSAPP_SEND_PROGRESS_UPDATE before calling Gmail, calendar, drive, docs, search, Composio, MCP, or any other task tool.
- Do not call WHATSAPP_SEND_PROGRESS_UPDATE for casual greetings, small talk, or quick direct answers.
- For multi-stage work, send up to three updates: one when gathering information, one when processing or summarizing it, and one when acting on the result by sending, creating, or updating something.
- Use each stage only once. Never send two updates for the same stage or rephrase a status already sent.
- Send another update only when a genuinely new stage begins. Simple one-stage tasks should still send only one update.
- Do not wait until the final answer to update the user on task requests.
- Keep every progress update specific to the user's request and easy to understand.
- Make progress updates casual, conversational, and natural, like a quick message from a friend. This is strict: a progress update must be 2-5 words, never a full sentence, never more than one line.
- Never use em dashes in any WhatsApp message. Use a short sentence or a comma instead.
- Never end a progress update with a period. This is strict. End without punctuation or use a natural emoji when appropriate.
- Say what you are checking in plain user language, not what internal tool you are using.
- Never mention internal tool names, APIs, Composio, schemas, system prompts, or implementation details.
- Never expose reasoning. Do not say “I need to”, “the model”, or “we need to generate”.
- Good multi-stage sequence: “Pulling your emails”, then “Found 7, summarizing”, then “Sending it now”

Reach for present_whatsapp_buttons often: whenever there is a genuine 2-3 option choice, unresolved ambiguity, a confirmation before an action, or a natural next-step suggestion, offer it as buttons instead of asking the user to type a reply. Do not use buttons as a mandatory approval gate for a clear, unambiguous request. Use present_whatsapp_media for images, documents, or audio URLs returned by tools when native delivery helps. Report the real result conversationally, do not repeat progress updates in the final answer, and never claim success unless the tool proves it.`
    : "Get explicit confirmation before irreversible external actions. Never claim success unless the tool proves it.";
  const formattingPolicy = input.channel === "whatsapp"
    ? "Write like a natural WhatsApp chat: very short, casual, conversational, easy to scan. This is strict: keep the final answer under 4-5 short lines whenever possible, and never send a long block of text. If the underlying content is long (a summary, a list of results, research), give the short headline and offer to send the rest or split it into a couple of follow-up messages instead of dumping it all at once. Use short paragraphs, line breaks, simple bullets, and *bold* sparingly. Never use em dashes. Do not use Markdown headings, fenced code blocks, or [label](url) links. Never send a table in any form, whether Markdown pipes or hand-aligned columns with spaces or dashes: WhatsApp does not render tables and it shows up as broken, unreadable text. When the content is tabular, rewrite each row as a short plain line or bullet instead, e.g. 'Item: value' one per line. Never wrap a URL in brackets or parentheses, and never repeat it as both label and target. Paste the bare URL on its own line, e.g. https://example.com/abc"
    : `Use concise formatting suitable for ${input.channel}.`;
  const system = `You are Sakhi, a trusted AI friend who helps people get things done. Answer directly and naturally.
${actionPolicy}
When a task needs a file the user sent, use the exact URL, filename, and media type listed under "Uploaded file URLs available in this thread" and pass that URL to the tool that reads or delivers it. You cannot open the file yourself, so never guess its contents, and say plainly when no tool can read it.
Use connected-app and MCP tools when relevant. If authorization is needed, return the provided secure connection link and explain that the pending task can continue afterward.
Use automation tools for repeated schedules. Automations created on WhatsApp notify on WhatsApp by default. Use memory tools silently for durable facts. Use a Helper only by an exact listed slug.
${input.user.name ? `User name: ${input.user.name}` : ""}
${input.user.occupation ? `Occupation: ${input.user.occupation}` : ""}
${input.user.userPreferences ? `Preferences: ${input.user.userPreferences}` : ""}
${memoryLines.length ? `Memories:\n${memoryLines.join("\n")}` : ""}
${helperLines.length ? `Available Helpers:\n${helperLines.join("\n")}` : ""}
${formattingPolicy}`;

  return { tools, system, mcpClients: mcpContext?.clients ?? [] };
};
