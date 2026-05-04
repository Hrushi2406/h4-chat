import {
  CalendarDays,
  FileText,
  Globe,
  HardDrive,
  Hammer,
  Inbox,
  ListTodo,
  PlugZap,
  Sun,
} from "lucide-react";

type ToolDisplay = {
  displayName: string;
  Icon: any;
  tooltip: string;
};

type AppName = "Email" | "Calendar" | "Drive" | "Notion" | "Linear" | "Apps";

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
  appName: AppName;
  fallbackLoading: string;
  fallbackDone: string;
  Icon: any;
}> = [
  {
    match: (context) => includesAny(context, ["GMAIL", "EMAIL", "MAIL"]),
    appName: "Email",
    fallbackLoading: "Working with email",
    fallbackDone: "Used email",
    Icon: Inbox,
  },
  {
    match: (context) => includesAny(context, ["GOOGLECALENDAR", "CALENDAR"]),
    appName: "Calendar",
    fallbackLoading: "Working with calendar",
    fallbackDone: "Used calendar",
    Icon: CalendarDays,
  },
  {
    match: (context) => includesAny(context, ["GOOGLEDRIVE", "DRIVE"]),
    appName: "Drive",
    fallbackLoading: "Working with drive",
    fallbackDone: "Used drive",
    Icon: HardDrive,
  },
  {
    match: (context) => includesAny(context, ["NOTION"]),
    appName: "Notion",
    fallbackLoading: "Working with Notion",
    fallbackDone: "Used Notion",
    Icon: FileText,
  },
  {
    match: (context) => includesAny(context, ["LINEAR"]),
    appName: "Linear",
    fallbackLoading: "Working with Linear",
    fallbackDone: "Used Linear",
    Icon: ListTodo,
  },
  {
    match: (context) => context.includes("COMPOSIO"),
    appName: "Apps",
    fallbackLoading: "Managing app connection",
    fallbackDone: "Checked app connection",
    Icon: PlugZap,
  },
];

export const getToolDisplayName = (
  toolName: string,
  status: string,
  toolPart?: unknown
): ToolDisplay => {
  const normalizedToolName = toolName.toUpperCase();
  const toolContext = getToolContext(normalizedToolName, toolPart);
  const appNames = getAppNames(toolContext);
  const context = [
    normalizedToolName,
    ...toolContext.toolSlugs,
    toolContext.searchText,
    toolContext.raw,
  ].join(" ");
  const composioTool = getComposioDisplay(appNames, context);

  if (composioTool) {
    const label = getComposioLabel(
      normalizedToolName,
      toolContext,
      appNames,
      composioTool,
      isToolCalling(status)
    );

    return {
      displayName: label,
      Icon: composioTool.Icon,
      tooltip: getComposioTooltip(label, toolName, toolContext, appNames),
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
      value.endsWith(` ${token}`)
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
      context.endsWith(` ${token}`)
  );

const getToolContext = (toolName: string, toolPart?: unknown) => {
  const contextParts = [toolName];
  const toolSlugs: string[] = [];
  const searchParts: string[] = [];

  collectContext(toolPart, contextParts, toolSlugs, searchParts);

  return {
    raw: contextParts
      .join(" ")
      .replace(/[^a-zA-Z0-9_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase(),
    toolSlugs: dedupe(toolSlugs).map(formatToolSlug),
    toolSlugContext: dedupe(toolSlugs).join(" ").toUpperCase(),
    searchText: searchParts.join(" ").toUpperCase(),
    searchTexts: dedupe(searchParts.map(cleanTooltipText)).filter(Boolean),
  };
};

const collectContext = (
  value: unknown,
  contextParts: string[],
  toolSlugs: string[],
  searchParts: string[],
  depth = 0
) => {
  if (depth > 4 || contextParts.join(" ").length > 6000) {
    return;
  }

  if (typeof value === "string" || typeof value === "number") {
    contextParts.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    value.slice(0, 20).forEach((item) =>
      collectContext(item, contextParts, toolSlugs, searchParts, depth + 1)
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

    if (isSearchTextKey(key)) {
      extractStrings(item).forEach((text) => searchParts.push(text));
    }

    collectContext(item, contextParts, toolSlugs, searchParts, depth + 1);
  });
};

const isToolSlugKey = (key: string) =>
  [
    "toolslug",
    "tool_slug",
    "toolslugs",
    "tool_slugs",
    "primarytoolslugs",
  ].includes(key.toLowerCase());

const isSearchTextKey = (key: string) =>
  ["query", "use_case", "usecase", "known_fields", "knownfields"].includes(
    key.toLowerCase()
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

  return Object.values(value as Record<string, unknown>).flatMap(extractStrings);
};

const getAppNames = (context: ReturnType<typeof getToolContext>): AppName[] => {
  const slugContext = context.toolSlugs.join(" ");
  const searchContext = context.searchText;
  const rawContext = context.raw;
  const appNames: AppName[] = [];

  composioToolDisplay
    .filter(({ appName }) => appName !== "Apps")
    .forEach((display) => {
      if (
        display.match(slugContext) ||
        display.match(searchContext) ||
        display.match(rawContext)
      ) {
        appNames.push(display.appName);
      }
    });

  return dedupe(appNames);
};

const getComposioDisplay = (appNames: AppName[], context: string) => {
  if (appNames.length === 1) {
    return composioToolDisplay.find(({ appName }) => appName === appNames[0]);
  }

  if (appNames.length > 1) {
    return composioToolDisplay.find(({ appName }) => appName === "Apps");
  }

  return composioToolDisplay.find(({ match }) => match(context));
};

const getComposioLabel = (
  toolName: string,
  context: ReturnType<typeof getToolContext>,
  appNames: AppName[],
  display: (typeof composioToolDisplay)[number],
  calling: boolean
) => {
  const appLabel =
    appNames.length === 1
      ? appNames[0]
      : appNames.length > 1
        ? "Apps"
        : display.appName;

  if (toolName === "COMPOSIO_SEARCH_TOOLS") {
    return `${calling ? "Finding" : "Found"} ${
      appLabel === "Apps" ? "app tools" : `${appLabel} tools`
    }`;
  }

  if (toolName === "COMPOSIO_GET_TOOL_SCHEMAS") {
    return `${calling ? "Loading" : "Loaded"} ${
      appLabel === "Apps" ? "tool details" : `${appLabel} tool details`
    }`;
  }

  if (toolName === "COMPOSIO_MANAGE_CONNECTIONS") {
    const action = getConnectionAction(context.raw);
    return `${calling ? action.loading : action.done} ${
      appLabel === "Apps" ? "apps" : appLabel
    }`;
  }

  if (toolName === "COMPOSIO_MULTI_EXECUTE_TOOL") {
    const action = getComposioAction(
      context.toolSlugContext,
      context.searchText
    );
    return `${calling ? action?.loading ?? "Using" : action?.done ?? "Used"} ${appLabel}`;
  }

  const action = getComposioAction(
    `${context.toolSlugContext} ${toolName}`,
    context.searchText
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

const getComposioTooltip = (
  label: string,
  toolName: string,
  context: ReturnType<typeof getToolContext>,
  appNames: AppName[]
) => {
  const appText = appNames.length > 0 ? appNames.join(", ") : "Composio apps";
  const searchText =
    context.searchTexts.length > 0
      ? `\nSearched for: ${context.searchTexts.slice(0, 3).join(" / ")}`
      : "";
  const slugText =
    context.toolSlugs.length > 0
      ? `\nTool used: ${context.toolSlugs.slice(0, 3).join(", ")}`
      : "";

  return `${label}\nApp: ${appText}${searchText}${slugText}`;
};

const dedupe = <T,>(items: T[]) => Array.from(new Set(items));

const cleanTooltipText = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const formatToolSlug = (value: string) => value.trim().toUpperCase();
