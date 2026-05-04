import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

export const COMPOSIO_TOOLKITS = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "notion",
  "linear",
] as const;

export const COMPOSIO_TOOLKIT_LABELS: Record<ComposioToolkit, string> = {
  gmail: "Email",
  googlecalendar: "Calendar",
  googledrive: "Drive",
  notion: "Notion",
  linear: "Linear",
};

export type ComposioToolkit = (typeof COMPOSIO_TOOLKITS)[number];

export const isComposioConfigured = () => Boolean(process.env.COMPOSIO_API_KEY);

export const getComposioUserId = (userId: string) => `h4-chat:${userId}`;

export const createComposioClient = () =>
  new Composio({
    provider: new VercelProvider(),
  });

export const createComposioSession = async (userId: string) => {
  const composio = createComposioClient();

  return composio.create(getComposioUserId(userId), {
    toolkits: [...COMPOSIO_TOOLKITS],
    multiAccount: {
      enable: true,
      maxAccountsPerToolkit: 3,
    },
  });
};

export const isSupportedComposioToolkit = (
  toolkit: string
): toolkit is ComposioToolkit =>
  COMPOSIO_TOOLKITS.includes(toolkit as ComposioToolkit);
