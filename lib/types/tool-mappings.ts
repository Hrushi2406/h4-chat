import {
  Cloud,
  CloudRain,
  Diamond,
  Globe,
  Hammer,
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

export const getToolDisplayName = (
  toolName: string,
  status: "partial-call" | "call" | "result"
): { displayName: string; Icon: any } => {
  const tool = toolDisplayNames[toolName];

  if (!tool)
    return {
      displayName: toolName.toLowerCase(),
      Icon: Hammer,
    };

  if (status === "partial-call" || status === "call") {
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
