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
  source?: "mcp" | "composio" | "native";
  toolLabel?: string;
};

export const toolDisplayNames: Record<
  string,
  { loading: string; done: string; Icon: any }
> = {
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
    match: (context) => includesAny(context, ["GITHUB"]),
    appSlug: "github",
    fallbackLoading: "Working with GitHub",
    fallbackDone: "Used GitHub",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["TRELLO"]),
    appSlug: "trello",
    fallbackLoading: "Working with Trello",
    fallbackDone: "Used Trello",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["GOOGLEDOCS", "GOOGLE DOCS"]),
    appSlug: "googledocs",
    fallbackLoading: "Working with Google Docs",
    fallbackDone: "Used Google Docs",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["GOOGLESHEETS", "GOOGLE SHEETS"]),
    appSlug: "googlesheets",
    fallbackLoading: "Working with Google Sheets",
    fallbackDone: "Used Google Sheets",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["OUTLOOK"]),
    appSlug: "outlook",
    fallbackLoading: "Working with Outlook",
    fallbackDone: "Used Outlook",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["HUBSPOT"]),
    appSlug: "hubspot",
    fallbackLoading: "Working with HubSpot",
    fallbackDone: "Used HubSpot",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["SALESFORCE"]),
    appSlug: "salesforce",
    fallbackLoading: "Working with Salesforce",
    fallbackDone: "Used Salesforce",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["CONFLUENCE"]),
    appSlug: "confluence",
    fallbackLoading: "Working with Confluence",
    fallbackDone: "Used Confluence",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["STRIPE"]),
    appSlug: "stripe",
    fallbackLoading: "Working with Stripe",
    fallbackDone: "Used Stripe",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["GOOGLESLIDES", "GOOGLE SLIDES"]),
    appSlug: "googleslides",
    fallbackLoading: "Working with Google Slides",
    fallbackDone: "Used Google Slides",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["GOOGLEFORMS", "GOOGLE FORMS"]),
    appSlug: "googleforms",
    fallbackLoading: "Working with Google Forms",
    fallbackDone: "Used Google Forms",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["GOOGLETASKS", "GOOGLE TASKS"]),
    appSlug: "googletasks",
    fallbackLoading: "Working with Google Tasks",
    fallbackDone: "Used Google Tasks",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["GOOGLEMEET", "GOOGLE MEET"]),
    appSlug: "googlemeet",
    fallbackLoading: "Working with Google Meet",
    fallbackDone: "Used Google Meet",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["GOOGLE_CHAT", "GOOGLE CHAT"]),
    appSlug: "google_chat",
    fallbackLoading: "Working with Google Chat",
    fallbackDone: "Used Google Chat",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["GOOGLECONTACTS", "GOOGLE CONTACTS"]),
    appSlug: "googlecontacts",
    fallbackLoading: "Working with Google Contacts",
    fallbackDone: "Used Google Contacts",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["GOOGLEPHOTOS", "GOOGLE PHOTOS"]),
    appSlug: "googlephotos",
    fallbackLoading: "Working with Google Photos",
    fallbackDone: "Used Google Photos",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["GOOGLE_MAPS", "GOOGLE MAPS"]),
    appSlug: "google_maps",
    fallbackLoading: "Working with Google Maps",
    fallbackDone: "Used Google Maps",
    Icon: PlugZap,
  },
  {
    match: (context) =>
      includesAny(context, ["GOOGLE_SEARCH_CONSOLE", "GOOGLE SEARCH CONSOLE"]),
    appSlug: "google_search_console",
    fallbackLoading: "Working with Google Search Console",
    fallbackDone: "Used Google Search Console",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["SHOPIFY"]),
    appSlug: "shopify",
    fallbackLoading: "Working with Shopify",
    fallbackDone: "Used Shopify",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["FIGMA"]),
    appSlug: "figma",
    fallbackLoading: "Working with Figma",
    fallbackDone: "Used Figma",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["CANVA"]),
    appSlug: "canva",
    fallbackLoading: "Working with Canva",
    fallbackDone: "Used Canva",
    Icon: Image,
  },
  {
    match: (context) => includesAny(context, ["INSTAGRAM"]),
    appSlug: "instagram",
    fallbackLoading: "Working with Instagram",
    fallbackDone: "Used Instagram",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["STRAVA"]),
    appSlug: "strava",
    fallbackLoading: "Working with Strava",
    fallbackDone: "Used Strava",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["YOUTUBE"]),
    appSlug: "youtube",
    fallbackLoading: "Working with YouTube",
    fallbackDone: "Used YouTube",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["ELEVENLABS"]),
    appSlug: "elevenlabs",
    fallbackLoading: "Working with ElevenLabs",
    fallbackDone: "Used ElevenLabs",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["CATS"]),
    appSlug: "cats",
    fallbackLoading: "Working with Cats",
    fallbackDone: "Used Cats",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["FAL_AI", "FAL AI"]),
    appSlug: "fal_ai",
    fallbackLoading: "Working with Fal.ai",
    fallbackDone: "Used Fal.ai",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["TODOIST"]),
    appSlug: "todoist",
    fallbackLoading: "Working with Todoist",
    fallbackDone: "Used Todoist",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["METAADS", "META ADS"]),
    appSlug: "metaads",
    fallbackLoading: "Working with Meta Ads",
    fallbackDone: "Used Meta Ads",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["GOOGLEADS", "GOOGLE ADS"]),
    appSlug: "googleads",
    fallbackLoading: "Working with Google Ads",
    fallbackDone: "Used Google Ads",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["REDDIT"]),
    appSlug: "reddit",
    fallbackLoading: "Working with Reddit",
    fallbackDone: "Used Reddit",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["FACEBOOK"]),
    appSlug: "facebook",
    fallbackLoading: "Working with Facebook",
    fallbackDone: "Used Facebook",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["LINKEDIN"]),
    appSlug: "linkedin",
    fallbackLoading: "Working with LinkedIn",
    fallbackDone: "Used LinkedIn",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["AHREFS"]),
    appSlug: "ahrefs",
    fallbackLoading: "Working with Ahrefs",
    fallbackDone: "Used Ahrefs",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["GEMINI"]),
    appSlug: "gemini",
    fallbackLoading: "Working with Gemini",
    fallbackDone: "Used Gemini",
    Icon: PlugZap,
  },
  {
    match: (context) => includesAny(context, ["COMPOSIO_SEARCH", "COMPOSIO SEARCH"]),
    appSlug: "composio_search",
    fallbackLoading: "Searching Composio",
    fallbackDone: "Searched Composio",
    Icon: PlugZap,
  },
  {
    match: (context) =>
      includesAny(context, ["BROWSER_TOOL", "BROWSER TOOL", "BROWSER"]),
    appSlug: "browser_tool",
    fallbackLoading: "Using Browser Tool",
    fallbackDone: "Used Browser Tool",
    Icon: Globe,
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
  mcpServerNames: Record<string, string> = {},
): ToolDisplay => {
  if (isMcpToolName(toolName)) {
    const details = getMcpToolDetails(toolName, mcpServerNames);

    return {
      displayName: isToolCalling(status)
        ? `Using ${details.serverName}`
        : `Used ${details.serverName}`,
      toolLabel: details.toolName,
      Icon: PlugZap,
      tooltip: [
        `${details.serverName} MCP`,
        `Tool: ${details.toolName}`,
        `Slug: ${toolName}`,
      ].join("\n"),
      source: "mcp",
    };
  }

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
      source: "composio",
    };
  }

  const tool = toolDisplayNames[toolName];

  if (!tool)
    return {
      displayName: toolName.toLowerCase(),
      Icon: Hammer,
      tooltip: `Tool: ${toolName}`,
      source: "native",
    };

  if (isToolCalling(status)) {
    return {
      displayName: tool.loading,
      Icon: tool.Icon,
      tooltip: `Tool: ${toolName}`,
      source: "native",
    };
  }
  return {
    displayName: tool.done,
    Icon: tool.Icon,
    tooltip: `Tool: ${toolName}`,
    source: "native",
  };
};

const isToolCalling = (status: string) =>
  status === "partial-call" ||
  status === "call" ||
  status === "input-streaming" ||
  status === "input-available";

const isMcpToolName = (toolName: string) => toolName.toLowerCase().startsWith("mcp_");

const getMcpToolDetails = (
  toolName: string,
  mcpServerNames: Record<string, string>,
) => {
  const withoutPrefix = toolName.replace(/^mcp_/i, "");
  const [server, ...toolParts] = withoutPrefix.split("_");
  const tool = toolParts.join(" ") || server || "tool";
  const serverId = server || "mcp";
  const configuredName = mcpServerNames[serverId.toLowerCase()];

  return {
    serverName: configuredName?.trim() || formatReadableSlug(serverId),
    toolName: formatReadableSlug(tool),
  };
};

const formatReadableSlug = (value: string) =>
  value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

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
  ahrefs: "Ahrefs",
  canva: "Canva",
  cats: "Cats",
  confluence: "Confluence",
  composio: "Composio",
  composio_search: "Composio Search",
  browser_tool: "Browser Tool",
  elevenlabs: "ElevenLabs",
  facebook: "Facebook",
  fal_ai: "Fal.ai",
  figma: "Figma",
  gemini: "Gemini",
  github: "GitHub",
  gmail: "Gmail",
  google_chat: "Google Chat",
  google_maps: "Google Maps",
  google_search_console: "Google Search Console",
  googlecalendar: "Google Calendar",
  googlecontacts: "Google Contacts",
  googledocs: "Google Docs",
  googledrive: "Google Drive",
  googleforms: "Google Forms",
  googlemeet: "Google Meet",
  googlephotos: "Google Photos",
  googlesheets: "Google Sheets",
  googleslides: "Google Slides",
  googletasks: "Google Tasks",
  hubspot: "HubSpot",
  instagram: "Instagram",
  linear: "Linear",
  linkedin: "LinkedIn",
  metaads: "Meta Ads",
  notion: "Notion",
  outlook: "Outlook",
  reddit: "Reddit",
  sandbox: "Sandbox",
  salesforce: "Salesforce",
  shopify: "Shopify",
  strava: "Strava",
  stripe: "Stripe",
  todoist: "Todoist",
  trello: "Trello",
  youtube: "YouTube",
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

  if (slug.startsWith("GOOGLE_CHAT_")) {
    return "google_chat";
  }

  if (slug.startsWith("GOOGLECONTACTS_")) {
    return "googlecontacts";
  }

  if (slug.startsWith("GOOGLEPHOTOS_")) {
    return "googlephotos";
  }

  if (slug.startsWith("GOOGLE_MAPS_")) {
    return "google_maps";
  }

  if (slug.startsWith("GOOGLE_SEARCH_CONSOLE_")) {
    return "google_search_console";
  }

  if (slug.startsWith("GOOGLESLIDES_")) {
    return "googleslides";
  }

  if (slug.startsWith("GOOGLEFORMS_")) {
    return "googleforms";
  }

  if (slug.startsWith("GOOGLETASKS_")) {
    return "googletasks";
  }

  if (slug.startsWith("FAL_AI_")) {
    return "fal_ai";
  }

  if (slug.startsWith("METAADS_")) {
    return "metaads";
  }

  if (slug.startsWith("GOOGLEADS_")) {
    return "googleads";
  }

  if (slug.startsWith("COMPOSIO_SEARCH_")) {
    return "composio_search";
  }

  if (slug.startsWith("BROWSER_TOOL_")) {
    return "browser_tool";
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
