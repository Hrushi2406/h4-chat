import type { WhatsAppProgressEvent } from "@/lib/whatsapp/types";

export const getWhatsAppToolProgress = (toolName: string) => {
  const name = toolName.toLowerCase();
  if (name.includes("memory") || name === "create_prompt_share_link") return;
  if ((name.includes("gmail") || name.includes("email") || name.includes("outlook")) && name.includes("send")) {
    return [
      { kind: "working", label: "Sending your email…" },
      { kind: "completed", label: "Email sent" },
    ] satisfies WhatsAppProgressEvent[];
  }
  if (name.includes("image") || name.includes("fal") || name.includes("pexels")) {
    return [
      { kind: "working", label: "Creating your image…" },
      { kind: "completed", label: "Image ready" },
    ] satisfies WhatsAppProgressEvent[];
  }
  if (name.includes("document") || name.includes("file") || name.includes("pdf") || name.includes("slides") || name.includes("sheet")) {
    return [
      { kind: "working", label: "Preparing your file…" },
      { kind: "completed", label: "File ready" },
    ] satisfies WhatsAppProgressEvent[];
  }
  if (name.includes("scheduled_task") || name.includes("automation")) {
    return [
      { kind: "working", label: "Setting up your automation…" },
      { kind: "completed", label: "Automation ready" },
    ] satisfies WhatsAppProgressEvent[];
  }
  if (name.includes("calendar")) {
    return [
      { kind: "working", label: "Updating your calendar…" },
      { kind: "completed", label: "Calendar updated" },
    ] satisfies WhatsAppProgressEvent[];
  }
  if (/\b(get|list|search|read|find|fetch|lookup|query|retrieve)\b/.test(name.replaceAll("_", " "))) {
    return [
      { kind: "working", label: "Looking that up…" },
      { kind: "completed", label: "Found it" },
    ] satisfies WhatsAppProgressEvent[];
  }
  if (name.includes("connect") || name.includes("manage_connections")) {
    return [
      { kind: "connecting", label: "Connecting your app…" },
      { kind: "completed", label: "App connected" },
    ] satisfies WhatsAppProgressEvent[];
  }
  return [
    { kind: "working", label: "Taking care of that…" },
    { kind: "completed", label: "All set" },
  ] satisfies WhatsAppProgressEvent[];
};
