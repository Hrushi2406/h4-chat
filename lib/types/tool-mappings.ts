import {
  CalendarDays,
  Cloud,
  CloudRain,
  FileText,
  Globe,
  HardDrive,
  Hammer,
  Inbox,
  ListTodo,
  PlugZap,
  PenToolIcon,
  Snowflake,
  Square,
  Star,
  Sun,
  SunDim,
  Zap,
} from "lucide-react";
import { GoogleLogo, OpenAILogo } from "../brand-logos";

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
  match: (toolName: string) => boolean;
  loading: string;
  done: string;
  Icon: any;
}> = [
  {
    match: (toolName) => toolName.startsWith("COMPOSIO_"),
    loading: "Managing app connection...",
    done: "Checked app connection",
    Icon: PlugZap,
  },
  {
    match: (toolName) => toolName.startsWith("GMAIL_"),
    loading: "Working with email...",
    done: "Used email",
    Icon: Inbox,
  },
  {
    match: (toolName) => toolName.startsWith("GOOGLECALENDAR_"),
    loading: "Working with calendar...",
    done: "Used calendar",
    Icon: CalendarDays,
  },
  {
    match: (toolName) => toolName.startsWith("GOOGLEDRIVE_"),
    loading: "Working with drive...",
    done: "Used drive",
    Icon: HardDrive,
  },
  {
    match: (toolName) => toolName.startsWith("NOTION_"),
    loading: "Working with Notion...",
    done: "Used Notion",
    Icon: FileText,
  },
  {
    match: (toolName) => toolName.startsWith("LINEAR_"),
    loading: "Working with Linear...",
    done: "Used Linear",
    Icon: ListTodo,
  },
];

export const getToolDisplayName = (
  toolName: string,
  status: string
): { displayName: string; Icon: any } => {
  const normalizedToolName = toolName.toUpperCase();
  const composioTool = composioToolDisplay.find(({ match }) =>
    match(normalizedToolName)
  );

  if (composioTool) {
    return {
      displayName: isToolCalling(status)
        ? composioTool.loading
        : composioTool.done,
      Icon: composioTool.Icon,
    };
  }

  const tool = toolDisplayNames[toolName];

  if (!tool)
    return {
      displayName: toolName.toLowerCase(),
      Icon: Hammer,
    };

  if (isToolCalling(status)) {
    return {
      displayName: tool.loading,
      Icon: tool.Icon,
    };
  }
  return {
    displayName: tool.done,
    Icon: tool.Icon,
  };
};

const isToolCalling = (status: string) =>
  status === "partial-call" ||
  status === "call" ||
  status === "input-streaming" ||
  status === "input-available";
