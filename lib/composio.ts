import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

export const COMPOSIO_TOOLKITS = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "notion",
  "linear",
  "github",
  "trello",
  "googledocs",
  "googlesheets",
  "outlook",
  "hubspot",
  "salesforce",
  "confluence",
  "stripe",
  "googleslides",
  "googletasks",
  "googlemeet",
  "googlephotos",
  "google_maps",
  "google_search_console",
  "shopify",
  "figma",
] as const;

export const COMPOSIO_TOOLKIT_LABELS: Record<ComposioToolkit, string> = {
  gmail: "Email",
  googlecalendar: "Calendar",
  googledrive: "Drive",
  notion: "Notion",
  linear: "Linear",
  github: "GitHub",
  trello: "Trello",
  googledocs: "Google Docs",
  googlesheets: "Google Sheets",
  outlook: "Outlook",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  confluence: "Confluence",
  stripe: "Stripe",
  googleslides: "Google Slides",
  googletasks: "Google Tasks",
  googlemeet: "Google Meet",
  googlephotos: "Google Photos",
  google_maps: "Google Maps",
  google_search_console: "Google Search Console",
  shopify: "Shopify",
  figma: "Figma",
};

export type ComposioToolkit = (typeof COMPOSIO_TOOLKITS)[number];

export const isComposioConfigured = () => Boolean(process.env.COMPOSIO_API_KEY);

export const getComposioUserId = (userId: string) => `h4-chat:${userId}`;

export const createComposioClient = () =>
  new Composio({
    provider: new VercelProvider(),
  });

type CreateComposioSessionOptions = {
  callbackUrl?: string;
};

export const createComposioSession = async (
  userId: string,
  options: CreateComposioSessionOptions = {}
) => {
  const composio = createComposioClient();

  return composio.create(getComposioUserId(userId), {
    toolkits: [...COMPOSIO_TOOLKITS],
    manageConnections: {
      enable: true,
      ...(options.callbackUrl ? { callbackUrl: options.callbackUrl } : {}),
    },
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
