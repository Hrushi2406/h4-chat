export type WaitlistUseCase = {
  slug: string;
  appName: string;
  prompt: string;
};

export type WaitlistUseCaseCategory = {
  id: string;
  label: string;
  tagline: string;
  cases: WaitlistUseCase[];
};

export const getComposioLogoUrl = (slug: string) =>
  `https://logos.composio.dev/api/${slug}`;

export const WAITLIST_USE_CASE_CATEGORIES: WaitlistUseCaseCategory[] = [
  {
    id: "productivity",
    label: "Work & Productivity",
    tagline: "Your inbox, calendar, and tasks — handled before you even ask.",
    cases: [
      {
        slug: "gmail",
        appName: "Gmail",
        prompt: "Summarize my unread emails and draft replies",
      },
      {
        slug: "googlecalendar",
        appName: "Calendar",
        prompt: "Check my calendar and plan today",
      },
      {
        slug: "slack",
        appName: "Slack",
        prompt: "Summarize Slack channels and catch me up",
      },
      {
        slug: "notion",
        appName: "Notion",
        prompt: "Turn my Notion notes into clear next steps",
      },
      {
        slug: "todoist",
        appName: "Todoist",
        prompt: "Organize my tasks and hit every deadline",
      },
      {
        slug: "googledrive",
        appName: "Drive",
        prompt: "Find the right docs and summarize them",
      },
    ],
  },
  {
    id: "content",
    label: "Content & Research",
    tagline: "Create, publish, and research — without opening ten tabs.",
    cases: [
      {
        slug: "googledocs",
        appName: "Docs",
        prompt: "Draft and refine a Google Doc for me",
      },
      {
        slug: "reddit",
        appName: "Reddit",
        prompt: "Find and summarize Reddit discussions",
      },
      {
        slug: "youtube",
        appName: "YouTube",
        prompt: "Analyze my channel and suggest next videos",
      },
      {
        slug: "whatsapp",
        appName: "WhatsApp",
        prompt: "Draft WhatsApp replies for my business",
      },
      {
        slug: "browser_tool",
        appName: "Browser",
        prompt: "Research this site and pull what matters",
      },
      {
        slug: "instagram",
        appName: "Instagram",
        prompt: "Review my Instagram and plan content",
      },
    ],
  },
  {
    id: "growth",
    label: "Sales & Growth",
    tagline: "Pipeline, payments, and performance — one conversation away.",
    cases: [
      {
        slug: "hubspot",
        appName: "HubSpot",
        prompt: "Review my deals and flag follow-ups",
      },
      {
        slug: "salesforce",
        appName: "Salesforce",
        prompt: "Summarize Salesforce records and next steps",
      },
      {
        slug: "stripe",
        appName: "Stripe",
        prompt: "Summarize revenue and recent payments",
      },
      {
        slug: "metaads",
        appName: "Meta Ads",
        prompt: "Review Meta Ads performance",
      },
      {
        slug: "ahrefs",
        appName: "Ahrefs",
        prompt: "Analyze SEO data in Ahrefs",
      },
      {
        slug: "linkedin",
        appName: "LinkedIn",
        prompt: "Draft a LinkedIn post in my voice",
      },
      {
        slug: "googleads",
        appName: "Google Ads",
        prompt: "What's working in my ad campaigns?",
      },
      {
        slug: "shopify",
        appName: "Shopify",
        prompt: "Review recent orders and top customers",
      },
    ],
  },
  {
    id: "engineering",
    label: "Engineering & Product",
    tagline: "Ship faster with live context from the tools your team lives in.",
    cases: [
      {
        slug: "github",
        appName: "GitHub",
        prompt: "Review my PRs and triage open issues",
      },
      {
        slug: "linear",
        appName: "Linear",
        prompt: "Prioritize issues for this sprint",
      },
      {
        slug: "trello",
        appName: "Trello",
        prompt: "Summarize my Trello boards and next actions",
      },
      {
        slug: "figma",
        appName: "Figma",
        prompt: "Summarize design context for review",
      },
      {
        slug: "confluence",
        appName: "Confluence",
        prompt: "Extract action items from team docs",
      },
      {
        slug: "googlesheets",
        appName: "Sheets",
        prompt: "Analyze this sheet and surface key insights",
      },
    ],
  },
];
