import {
  CalendarDays,
  Code2,
  Download,
  FileArchive,
  FileText,
  GitBranch,
  Globe,
  HardDrive,
  Hammer,
  Image,
  Inbox,
  ListTodo,
  Package,
  Play,
  PlugZap,
  Sun,
} from "lucide-react";
import { COMPOSIO_META_TOOLS } from "@/lib/types/composio-tool-slugs";

type ToolDisplay = {
  displayName: string;
  Icon: any;
  tooltip: string;
  appSlugs?: string[];
};

export const toolDisplayNames: Record<
  string,
  { loading: string; done: string; Icon: any }
> = {
  webSearch: {
    loading: "Searching the web...",
    done: "Searched the web",
    Icon: Globe,
  },
  getWeather: {
    loading: "Getting weather...",
    done: "Got weather",
    Icon: Sun,
  },
} as const;

export type ToolName = keyof typeof toolDisplayNames;

const composioToolDisplay: Array<{
  match: (context: string) => boolean;
  appSlug: string;
  fallbackLoading: string;
  fallbackDone: string;
  Icon: any;
}> = [
  {
    match: (context) => includesAny(context, ["GMAIL", "EMAIL", "MAIL"]),
    appSlug: "gmail",
    fallbackLoading: "Working with Gmail",
    fallbackDone: "Used Gmail",
    Icon: Inbox,
  },
  {
    match: (context) => includesAny(context, ["GOOGLECALENDAR", "CALENDAR"]),
    appSlug: "googlecalendar",
    fallbackLoading: "Working with Google Calendar",
    fallbackDone: "Used Google Calendar",
    Icon: CalendarDays,
  },
  {
    match: (context) => includesAny(context, ["GOOGLEDRIVE", "DRIVE"]),
    appSlug: "googledrive",
    fallbackLoading: "Working with Google Drive",
    fallbackDone: "Used Google Drive",
    Icon: HardDrive,
  },
  {
    match: (context) => includesAny(context, ["NOTION"]),
    appSlug: "notion",
    fallbackLoading: "Working with Notion",
    fallbackDone: "Used Notion",
    Icon: FileText,
  },
  {
    match: (context) => includesAny(context, ["LINEAR"]),
    appSlug: "linear",
    fallbackLoading: "Working with Linear",
    fallbackDone: "Used Linear",
    Icon: ListTodo,
  },
  {
    match: (context) => context.includes("COMPOSIO"),
    appSlug: "composio",
    fallbackLoading: "Using Composio",
    fallbackDone: "Used Composio",
    Icon: PlugZap,
  },
];

export const getToolDisplayName = (
  toolName: string,
  status: string,
  toolPart?: unknown,
): ToolDisplay => {
  const normalizedToolName = toolName.toUpperCase();
  const toolContext = getToolContext(normalizedToolName, toolPart);
  const appSlugs = getComposioAppSlugs(normalizedToolName, toolContext);
  const context = [
    normalizedToolName,
    ...toolContext.toolSlugs,
    toolContext.searchText,
    toolContext.raw,
  ].join(" ");
  const composioTool = getComposioDisplay(appSlugs, context);

  if (composioTool) {
    const label = getComposioLabel(
      normalizedToolName,
      toolContext,
      appSlugs,
      composioTool,
      isToolCalling(status),
    );

    return {
      displayName: label,
      Icon: getToolIcon(normalizedToolName, toolContext, composioTool.Icon),
      tooltip: getComposioTooltip(label, toolName, toolContext, appSlugs),
      appSlugs: getDisplayAppSlugs(appSlugs),
    };
  }

  const tool = toolDisplayNames[toolName];

  if (!tool)
    return {
      displayName: toolName.toLowerCase(),
      Icon: Hammer,
      tooltip: `Tool: ${toolName}`,
    };

  if (isToolCalling(status)) {
    return {
      displayName: tool.loading,
      Icon: tool.Icon,
      tooltip: `Tool: ${toolName}`,
    };
  }
  return {
    displayName: tool.done,
    Icon: tool.Icon,
    tooltip: `Tool: ${toolName}`,
  };
};

const isToolCalling = (status: string) =>
  status === "partial-call" ||
  status === "call" ||
  status === "input-streaming" ||
  status === "input-available";

const getToolIcon = (
  toolName: string,
  context: ReturnType<typeof getToolContext>,
  fallbackIcon: any,
) => {
  if (
    toolName !== COMPOSIO_META_TOOLS.REMOTE_BASH_TOOL &&
    toolName !== COMPOSIO_META_TOOLS.REMOTE_WORKBENCH
  ) {
    return fallbackIcon;
  }

  return getSandboxAction(context)?.Icon ?? fallbackIcon;
};

const getComposioAction = (toolName: string, searchText = "") => {
  const normalized = `${toolName.replace(/^COMPOSIO_/, "")} ${searchText}`;

  if (hasAny(normalized, ["CONNECT", "CONNECTION", "AUTHORIZE", "AUTH"])) {
    return { loading: "Connecting", done: "Connection checked" };
  }

  if (hasAny(normalized, ["SEARCH", "FIND", "QUERY", "LOOKUP"])) {
    return { loading: "Searching", done: "Searched" };
  }

  if (hasAny(normalized, ["LIST"])) {
    return { loading: "Listing", done: "Listed" };
  }

  if (hasAny(normalized, ["GET", "FETCH", "READ", "RETRIEVE"])) {
    return { loading: "Reading", done: "Read" };
  }

  if (hasAny(normalized, ["SEND", "REPLY", "FORWARD"])) {
    return { loading: "Sending", done: "Sent" };
  }

  if (hasAny(normalized, ["CREATE", "ADD", "INSERT", "DRAFT"])) {
    return { loading: "Creating", done: "Created" };
  }

  if (hasAny(normalized, ["UPDATE", "PATCH", "EDIT", "MODIFY", "MOVE"])) {
    return { loading: "Updating", done: "Updated" };
  }

  if (hasAny(normalized, ["DELETE", "REMOVE", "ARCHIVE"])) {
    return { loading: "Removing", done: "Removed" };
  }

  return undefined;
};

const hasAny = (value: string, tokens: string[]) =>
  tokens.some(
    (token) =>
      value.includes(`_${token}_`) ||
      value.startsWith(`${token}_`) ||
      value.endsWith(`_${token}`) ||
      value.includes(` ${token} `) ||
      value.startsWith(`${token} `) ||
      value.endsWith(` ${token}`),
  );

const includesAny = (context: string, tokens: string[]) =>
  tokens.some(
    (token) =>
      context === token ||
      context.includes(`_${token}_`) ||
      context.startsWith(`${token}_`) ||
      context.endsWith(`_${token}`) ||
      context.includes(` ${token} `) ||
      context.startsWith(`${token} `) ||
      context.endsWith(` ${token}`),
  );

const getToolContext = (toolName: string, toolPart?: unknown) => {
  const contextParts = [toolName];
  const toolSlugs: string[] = [];
  const toolkitSlugs: string[] = [];
  const searchParts: string[] = [];
  const commandParts: string[] = [];

  collectContext(
    toolPart,
    contextParts,
    toolSlugs,
    toolkitSlugs,
    searchParts,
    commandParts,
  );

  return {
    raw: contextParts
      .join(" ")
      .replace(/[^a-zA-Z0-9_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase(),
    toolSlugs: dedupe(toolSlugs.map(formatToolSlug)),
    toolkitSlugs: dedupe(toolkitSlugs.map(formatToolkitSlug)),
    toolSlugContext: dedupe(toolSlugs).join(" ").toUpperCase(),
    searchText: searchParts.join(" ").toUpperCase(),
    searchTexts: dedupe(searchParts.map(cleanTooltipText)).filter(Boolean),
    commandText: dedupe(commandParts.map(cleanTooltipText))
      .filter(Boolean)
      .join("\n"),
  };
};

const collectContext = (
  value: unknown,
  contextParts: string[],
  toolSlugs: string[],
  toolkitSlugs: string[],
  searchParts: string[],
  commandParts: string[],
  depth = 0,
) => {
  if (depth > 4 || contextParts.join(" ").length > 6000) {
    return;
  }

  if (typeof value === "string" || typeof value === "number") {
    contextParts.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    value
      .slice(0, 20)
      .forEach((item) =>
        collectContext(
          item,
          contextParts,
          toolSlugs,
          toolkitSlugs,
          searchParts,
          commandParts,
          depth + 1,
        ),
      );
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    contextParts.push(key);

    if (isToolSlugKey(key)) {
      extractStrings(item).forEach((slug) => toolSlugs.push(slug));
    }

    if (isToolkitSlugKey(key)) {
      extractStrings(item).forEach((slug) => toolkitSlugs.push(slug));
    }

    if (isSearchTextKey(key)) {
      extractStrings(item).forEach((text) => searchParts.push(text));
    }

    if (isCommandTextKey(key)) {
      extractStrings(item).forEach((text) => commandParts.push(text));
    }

    collectContext(
      item,
      contextParts,
      toolSlugs,
      toolkitSlugs,
      searchParts,
      commandParts,
      depth + 1,
    );
  });
};

const isToolSlugKey = (key: string) =>
  [
    "toolslug",
    "tool_slug",
    "toolslugs",
    "tool_slugs",
    "primarytoolslugs",
    "primary_tool_slugs",
    "relatedtoolslugs",
    "related_tool_slugs",
  ].includes(key.toLowerCase());

const isToolkitSlugKey = (key: string) =>
  [
    "toolkit",
    "toolkits",
    "toolkitslug",
    "toolkit_slug",
    "toolkitslugs",
    "toolkit_slugs",
  ].includes(key.toLowerCase());

const isSearchTextKey = (key: string) =>
  ["query", "use_case", "usecase", "known_fields", "knownfields"].includes(
    key.toLowerCase(),
  );

const isCommandTextKey = (key: string) =>
  ["bash", "cmd", "code", "command", "commands", "script", "shell"].includes(
    key.toLowerCase(),
  );

const extractStrings = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(extractStrings);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.values(value as Record<string, unknown>).flatMap(
    extractStrings,
  );
};

const getComposioAppSlugs = (
  toolName: string,
  context: ReturnType<typeof getToolContext>,
) => {
  if (
    toolName === COMPOSIO_META_TOOLS.REMOTE_BASH_TOOL ||
    toolName === COMPOSIO_META_TOOLS.REMOTE_WORKBENCH
  ) {
    return ["sandbox"];
  }

  const slugs = [
    ...context.toolkitSlugs,
    ...context.toolSlugs.map(getToolkitSlugFromToolSlug).filter(isString),
  ];

  if (toolName.startsWith("COMPOSIO_") && slugs.length === 0) {
    slugs.push("composio");
  } else {
    const toolkitFromToolName = getToolkitSlugFromToolSlug(toolName);
    if (toolkitFromToolName) {
      slugs.push(toolkitFromToolName);
    }
  }

  return dedupe(slugs);
};

const getComposioDisplay = (appSlugs: string[], context: string) => {
  const primaryAppSlug = getPrimaryAppSlug(appSlugs);

  if (primaryAppSlug === "sandbox") {
    return {
      match: () => true,
      appSlug: "sandbox",
      fallbackLoading: "Using Sandbox",
      fallbackDone: "Used Sandbox",
      Icon: Hammer,
    };
  }

  if (primaryAppSlug) {
    return (
      composioToolDisplay.find(({ appSlug }) => appSlug === primaryAppSlug) ??
      composioToolDisplay.find(({ appSlug }) => appSlug === "composio")
    );
  }

  return composioToolDisplay.find(({ match }) => match(context));
};

const getComposioLabel = (
  toolName: string,
  context: ReturnType<typeof getToolContext>,
  appSlugs: string[],
  display: (typeof composioToolDisplay)[number],
  calling: boolean,
) => {
  const displaySlugs = getDisplayAppSlugs(appSlugs);
  const appLabel =
    displaySlugs.length === 1
      ? formatAppSlug(displaySlugs[0])
      : displaySlugs.length > 1
        ? displaySlugs.map(formatAppSlug).join(", ")
        : formatAppSlug(display.appSlug);

  if (toolName === COMPOSIO_META_TOOLS.SEARCH_TOOLS) {
    return `${calling ? "Finding" : "Found"} ${
      displaySlugs.length === 0 || displaySlugs.includes("composio")
        ? "app tools"
        : `${appLabel} tools`
    }`;
  }

  if (toolName === COMPOSIO_META_TOOLS.GET_TOOL_SCHEMAS) {
    return `${calling ? "Loading" : "Loaded"} ${
      displaySlugs.length === 0 || displaySlugs.includes("composio")
        ? "tool details"
        : `${appLabel} tool details`
    }`;
  }

  if (toolName === COMPOSIO_META_TOOLS.MANAGE_CONNECTIONS) {
    const action = getConnectionAction(context.raw);
    return `${calling ? action.loading : action.done} ${appLabel}`;
  }

  if (toolName === COMPOSIO_META_TOOLS.MULTI_EXECUTE_TOOL) {
    const action = getComposioAction(
      context.toolSlugContext,
      context.searchText,
    );
    return `${calling ? (action?.loading ?? "Using") : (action?.done ?? "Used")} ${appLabel}`;
  }

  if (toolName === COMPOSIO_META_TOOLS.REMOTE_BASH_TOOL) {
    const action = getSandboxAction(context);
    return action
      ? calling
        ? action.loading
        : action.done
      : calling
        ? "Running Sandbox command"
        : "Ran Sandbox command";
  }

  if (toolName === COMPOSIO_META_TOOLS.REMOTE_WORKBENCH) {
    const action = getSandboxAction(context);
    return action
      ? calling
        ? action.loading
        : action.done
      : calling
        ? "Processing Sandbox data"
        : "Processed Sandbox data";
  }

  const action = getComposioAction(
    `${context.toolSlugContext} ${toolName}`,
    context.searchText,
  );

  if (action) {
    return `${calling ? action.loading : action.done} ${appLabel}`;
  }

  return calling ? display.fallbackLoading : display.fallbackDone;
};

const getConnectionAction = (context: string) => {
  if (includesAny(context, ["REMOVE", "DELETE"])) {
    return { loading: "Disconnecting", done: "Disconnected" };
  }

  if (includesAny(context, ["LIST", "STATUS"])) {
    return {
      loading: "Checking connections for",
      done: "Checked connections for",
    };
  }

  if (includesAny(context, ["RENAME"])) {
    return {
      loading: "Renaming connection for",
      done: "Renamed connection for",
    };
  }

  return { loading: "Connecting", done: "Connected" };
};

const getSandboxAction = (context: ReturnType<typeof getToolContext>) => {
  const command = `${context.commandText} ${context.raw}`.toLowerCase();

  if (!command.trim()) {
    return undefined;
  }

  if (
    /\b(apt-get|apt|brew|pip|pip3|npm|pnpm|yarn)\s+(install|add)\b/.test(
      command,
    )
  ) {
    return {
      loading: "Installing dependencies",
      done: "Installed dependencies",
      Icon: Package,
    };
  }

  const matchedCommand = sandboxCommandLabels.find(({ match }) =>
    match(command),
  );

  if (matchedCommand) {
    return matchedCommand.label;
  }

  return undefined;
};

const sandboxCommandLabels: Array<{
  label: { loading: string; done: string; Icon: any };
  match: (command: string) => boolean;
}> = [
  {
    label: {
      loading: "Processing media",
      done: "Processed media",
      Icon: Play,
    },
    match: (command) => /\bffmpeg\b/.test(command),
  },
  {
    label: {
      loading: "Editing images",
      done: "Edited images",
      Icon: Image,
    },
    match: (command) => /\b(convert|magick)\b/.test(command),
  },
  {
    label: {
      loading: "Running analysis",
      done: "Ran analysis",
      Icon: FileText,
    },
    match: (command) => /\b(python|python3|py)\b/.test(command),
  },
  {
    label: {
      loading: "Running code",
      done: "Ran code",
      Icon: Code2,
    },
    match: (command) => /\b(node|tsx|ts-node)\b/.test(command),
  },
  {
    label: {
      loading: "Installing dependencies",
      done: "Installed dependencies",
      Icon: Package,
    },
    match: (command) => /\b(pnpm|npm|yarn)\b/.test(command),
  },
  {
    label: {
      loading: "Working with files",
      done: "Updated files",
      Icon: GitBranch,
    },
    match: (command) => /\bgit\b/.test(command),
  },
  {
    label: {
      loading: "Fetching data",
      done: "Fetched data",
      Icon: Download,
    },
    match: (command) => /\b(curl|wget)\b/.test(command),
  },
  {
    label: {
      loading: "Preparing files",
      done: "Prepared files",
      Icon: FileArchive,
    },
    match: (command) => /\b(tar|zip|unzip)\b/.test(command),
  },
];

const getComposioTooltip = (
  label: string,
  toolName: string,
  context: ReturnType<typeof getToolContext>,
  appSlugs: string[],
) => {
  const displaySlugs = getDisplayAppSlugs(appSlugs);
  const appText =
    displaySlugs.length > 0
      ? displaySlugs.map(formatAppSlug).join(", ")
      : formatAppSlug("composio");
  const searchText =
    context.searchTexts.length > 0
      ? `\nSearched for: ${context.searchTexts.slice(0, 3).join(" / ")}`
      : "";
  const toolkitText =
    context.toolkitSlugs.length > 0
      ? `\nToolkit: ${context.toolkitSlugs
          .slice(0, 3)
          .map(formatAppSlug)
          .join(", ")}`
      : "";
  const slugText =
    context.toolSlugs.length > 0
      ? `\nTool used: ${context.toolSlugs
          .slice(0, 3)
          .map(formatToolSlugForDisplay)
          .join(", ")}`
      : "";
  const commandText = context.commandText
    ? `\nCommand: ${truncateTooltipText(context.commandText, 180)}`
    : "";

  return `${label}\nApp: ${appText}${toolkitText}${searchText}${slugText}${commandText}`;
};

const dedupe = <T>(items: T[]) => Array.from(new Set(items));

const getDisplayAppSlugs = (appSlugs: string[]) => {
  const nonComposioSlugs = appSlugs.filter((slug) => slug !== "composio");
  return nonComposioSlugs.length > 0 ? nonComposioSlugs : appSlugs;
};

const getPrimaryAppSlug = (appSlugs: string[]) =>
  getDisplayAppSlugs(appSlugs)[0];

const isString = (value: string | undefined): value is string =>
  typeof value === "string";

const cleanTooltipText = (value: string) => value.replace(/\s+/g, " ").trim();

const truncateTooltipText = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;

const formatToolSlug = (value: string) => value.trim().toUpperCase();

const formatToolkitSlug = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "")
    .toLowerCase();

const appLabels: Record<string, string> = {
  composio: "Composio",
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  googledocs: "Google Docs",
  googledrive: "Google Drive",
  googlemeet: "Google Meet",
  googlesheets: "Google Sheets",
  linear: "Linear",
  notion: "Notion",
  sandbox: "Sandbox",
};

const getToolkitSlugFromToolSlug = (value: string) => {
  const slug = value.trim().toUpperCase();

  if (!slug || slug.startsWith("COMPOSIO_")) {
    return undefined;
  }

  if (slug.startsWith("GOOGLECALENDAR_")) {
    return "googlecalendar";
  }

  if (slug.startsWith("GOOGLEDRIVE_")) {
    return "googledrive";
  }

  if (slug.startsWith("GOOGLESHEETS_")) {
    return "googlesheets";
  }

  if (slug.startsWith("GOOGLEDOCS_")) {
    return "googledocs";
  }

  if (slug.startsWith("GOOGLEMEET_")) {
    return "googlemeet";
  }

  const [toolkit] = slug.split("_");
  return toolkit ? toolkit.toLowerCase() : undefined;
};

const formatAppSlug = (slug: string) => {
  const normalized = formatToolkitSlug(slug);
  return (
    appLabels[normalized] ??
    normalized.split(/[_-]/g).filter(Boolean).map(formatTitlePart).join(" ")
  );
};

const formatToolSlugForDisplay = (slug: string) => {
  const normalized = slug.trim().replace(/^COMPOSIO_/, "");
  const toolkit = getToolkitSlugFromToolSlug(normalized);
  const withoutToolkit = toolkit
    ? normalized.replace(new RegExp(`^${toolkit.toUpperCase()}_`), "")
    : normalized;

  return withoutToolkit
    .split(/[_-]/g)
    .filter(Boolean)
    .map(formatTitlePart)
    .join(" ");
};

const formatTitlePart = (part: string) =>
  part.length <= 3
    ? part.toUpperCase()
    : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
