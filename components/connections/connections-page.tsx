"use client";

import React from "react";
import {
  CalendarDays,
  FileText,
  Flame,
  Globe,
  HardDrive,
  Image,
  Inbox,
  ListTodo,
  Loader2,
  MessageCircle,
  PlugZap,
  Receipt,
  Search,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { auth } from "@/lib/clients/firebase";
import { getApiErrorMessage, readJsonResponse } from "@/lib/api-response";
import {
  ConnectionToolkit,
  useConnections,
} from "@/lib/hooks/connections/use-connections";

const settingsBtnClass = "rounded-full";

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );
}

const toolkitIcons: Record<string, React.ElementType> = {
  gmail: Inbox,
  googlecalendar: CalendarDays,
  googledrive: HardDrive,
  notion: FileText,
  linear: ListTodo,
  splitwise: Receipt,
  canva: Image,
  whatsapp: MessageCircle,
  firecrawl: Flame,
  browser_tool: Globe,
};

const connectionCategoryOrder = [
  "Google Workspace",
  "Marketing & Social",
  "Productivity",
  "Developer Tools",
  "Sales & CRM",
  "Design & Media",
  "Personal",
  "Utilities",
] as const;

type ConnectionCategory = (typeof connectionCategoryOrder)[number];

type ConnectionMetadata = {
  category: ConnectionCategory;
  useCase: string;
  popularOrder?: number;
};

const connectionMetadata: Record<string, ConnectionMetadata> = {
  gmail: {
    category: "Google Workspace",
    useCase: "Read, draft, and send email",
    popularOrder: 1,
  },
  googlecalendar: {
    category: "Google Workspace",
    useCase: "Create events and manage schedules",
    popularOrder: 2,
  },
  googledrive: {
    category: "Google Workspace",
    useCase: "Find and manage Drive files",
    popularOrder: 3,
  },
  googledocs: {
    category: "Google Workspace",
    useCase: "Create and update documents",
    popularOrder: 4,
  },
  googlesheets: {
    category: "Google Workspace",
    useCase: "Read and update spreadsheets",
  },
  googleslides: {
    category: "Google Workspace",
    useCase: "Create and edit presentations",
  },
  googletasks: {
    category: "Google Workspace",
    useCase: "Track tasks and to-dos",
  },
  googlemeet: {
    category: "Google Workspace",
    useCase: "Work with meetings and calls",
  },
  googlephotos: {
    category: "Google Workspace",
    useCase: "Search and organize photos",
  },
  google_maps: {
    category: "Google Workspace",
    useCase: "Search places, routes, and locations",
  },
  google_search_console: {
    category: "Google Workspace",
    useCase: "Inspect search performance data",
  },
  notion: {
    category: "Productivity",
    useCase: "Search and update workspace pages",
  },
  linear: {
    category: "Productivity",
    useCase: "Manage issues, projects, and cycles",
  },
  trello: {
    category: "Productivity",
    useCase: "Create cards and organize boards",
  },
  confluence: {
    category: "Productivity",
    useCase: "Search and manage team docs",
  },
  todoist: { category: "Productivity", useCase: "Capture and organize tasks" },
  github: {
    category: "Developer Tools",
    useCase: "Work with repos, issues, and PRs",
  },
  firecrawl: {
    category: "Developer Tools",
    useCase: "Crawl websites and extract data",
  },
  gemini: {
    category: "Developer Tools",
    useCase: "Use Google AI models and tools",
  },
  composio_search: { category: "Developer Tools", useCase: "Search the web" },
  browser_tool: {
    category: "Developer Tools",
    useCase: "Browse and inspect web pages",
  },
  hubspot: {
    category: "Sales & CRM",
    useCase: "Manage contacts, deals, and CRM data",
  },
  salesforce: {
    category: "Sales & CRM",
    useCase: "Work with accounts and opportunities",
  },
  stripe: {
    category: "Sales & CRM",
    useCase: "Check payments, customers, and invoices",
  },
  shopify: {
    category: "Sales & CRM",
    useCase: "Manage store orders and products",
  },
  instagram: {
    category: "Marketing & Social",
    useCase: "Manage Instagram content and insights",
    popularOrder: 5,
  },
  whatsapp: {
    category: "Marketing & Social",
    useCase: "Send and manage messages",
  },
  youtube: {
    category: "Marketing & Social",
    useCase: "Work with videos and channel data",
    popularOrder: 6,
  },
  metaads: {
    category: "Marketing & Social",
    useCase: "Review and manage Meta campaigns",
  },
  googleads: {
    category: "Marketing & Social",
    useCase: "Manage Google ad campaigns",
  },
  reddit: {
    category: "Marketing & Social",
    useCase: "Search posts and community discussions",
  },
  facebook: {
    category: "Marketing & Social",
    useCase: "Manage Facebook pages and content",
    popularOrder: 8,
  },
  linkedin: {
    category: "Marketing & Social",
    useCase: "Work with professional social data",
  },
  ahrefs: {
    category: "Marketing & Social",
    useCase: "Research SEO and backlink data",
  },
  pexels: {
    category: "Design & Media",
    useCase: "Find stock photos and videos",
  },
  figma: {
    category: "Design & Media",
    useCase: "Access design files and comments",
  },
  canva: {
    category: "Design & Media",
    useCase: "Create and manage visual designs",
  },
  elevenlabs: {
    category: "Design & Media",
    useCase: "Generate and manage voice audio",
  },
  vapi: {
    category: "Design & Media",
    useCase: "Manage voice agents and calls",
  },
  fal_ai: {
    category: "Design & Media",
    useCase: "Generate images and media assets",
  },
  splitwise: {
    category: "Personal",
    useCase: "Track shared expenses and balances",
    popularOrder: 7,
  },
  strava: {
    category: "Personal",
    useCase: "Review activities and fitness data",
  },
  outlook: { category: "Utilities", useCase: "Read and send Outlook email" },
  cats: { category: "Utilities", useCase: "Access the connected toolkit" },
};

const getConnectionMetadata = (toolkit: ConnectionToolkit) =>
  connectionMetadata[toolkit.slug] ?? {
    category: "Utilities" as const,
    useCase: `Connect ${toolkit.name} to chat`,
  };

export default function ConnectionsPage() {
  const { uid } = useAuth();
  const [pendingSlug, setPendingSlug] = React.useState<string>();
  const [connectionSearch, setConnectionSearch] = React.useState("");
  const {
    data: toolkits = [],
    error,
    isLoading,
    refetch,
  } = useConnections(uid);
  const normalizedSearch = connectionSearch.trim().toLowerCase();

  const filteredToolkits = React.useMemo(() => {
    const sortedToolkits = [...toolkits].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (!normalizedSearch) return sortedToolkits;
    return sortedToolkits.filter((toolkit) => {
      const metadata = getConnectionMetadata(toolkit);
      const searchableText = [
        toolkit.name,
        toolkit.providerName,
        toolkit.slug,
        toolkit.status,
        metadata.category,
        metadata.useCase,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchableText.includes(normalizedSearch);
    });
  }, [normalizedSearch, toolkits]);

  const popularToolkits = React.useMemo(
    () =>
      toolkits
        .filter((toolkit) => getConnectionMetadata(toolkit).popularOrder)
        .sort(
          (a, b) =>
            (getConnectionMetadata(a).popularOrder ?? Number.MAX_SAFE_INTEGER) -
            (getConnectionMetadata(b).popularOrder ?? Number.MAX_SAFE_INTEGER),
        ),
    [toolkits],
  );

  const groupedToolkits = React.useMemo(() => {
    const groups = new Map<ConnectionCategory, ConnectionToolkit[]>();
    for (const category of connectionCategoryOrder) {
      groups.set(category, []);
    }
    for (const toolkit of filteredToolkits) {
      const metadata = getConnectionMetadata(toolkit);
      groups.get(metadata.category)?.push(toolkit);
    }
    return connectionCategoryOrder
      .map((category) => ({ category, toolkits: groups.get(category) ?? [] }))
      .filter((group) => group.toolkits.length > 0);
  }, [filteredToolkits]);

  const connect = async (toolkit: string) => {
    if (!uid) return;
    setPendingSlug(toolkit);
    try {
      const authToken = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, toolkit }),
      });
      const data = await readJsonResponse<{
        error?: string;
        redirectUrl?: string;
      }>(response);
      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(response, data, "Unable to start connection"),
        );
      }
      if (!data?.redirectUrl) {
        throw new Error("Connection link was not returned");
      }
      window.location.href = data.redirectUrl;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start connection";
      toast.error(message);
      setPendingSlug(undefined);
    }
  };

  const disconnect = async (toolkit: ConnectionToolkit) => {
    if (!toolkit.connectedAccountId) return;
    setPendingSlug(toolkit.slug);
    try {
      const authToken = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/connections/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authToken,
          connectedAccountId: toolkit.connectedAccountId,
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(response, data, "Unable to disconnect app"),
        );
      }
      toast.success(`${toolkit.name} disconnected`);
      await refetch();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to disconnect app";
      toast.error(message);
    } finally {
      setPendingSlug(undefined);
    }
  };

  const renderConnectionCard = (toolkit: ConnectionToolkit) => {
    const Icon = toolkitIcons[toolkit.slug] ?? PlugZap;
    const isPending = pendingSlug === toolkit.slug;
    const metadata = getConnectionMetadata(toolkit);

    return (
      <div className="flex min-w-0 items-center gap-3 py-3.5">
        <div className="grid size-12 shrink-0 place-items-center rounded-[14px] border bg-background shadow-sm">
          {toolkit.logo ? (
            <img
              src={toolkit.logo}
              alt=""
              className="size-8 rounded-sm object-contain"
            />
          ) : (
            <Icon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{toolkit.name}</p>
          <p className="mt-1 truncate text-xs leading-tight text-muted-foreground">
            {metadata.useCase}
          </p>
        </div>
        <div className="shrink-0">
          {toolkit.isConnected ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={cn(settingsBtnClass, "text-xs text-muted-foreground")}
              onClick={() => disconnect(toolkit)}
              disabled={Boolean(pendingSlug)}
            >
              {isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Remove"
              )}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                settingsBtnClass,
                "text-xs font-semibold text-primary",
              )}
              onClick={() => connect(toolkit.slug)}
              disabled={Boolean(pendingSlug)}
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderToolkitList = (toolkits: ConnectionToolkit[]) => (
    <div>
      {/* mobile: 1-column list */}
      <div className="divide-y sm:hidden">
        {toolkits.map((toolkit) => (
          <div key={toolkit.slug}>{renderConnectionCard(toolkit)}</div>
        ))}
      </div>
      {/* desktop: 2-column chunked grid */}
      <div className="hidden sm:block">
        {chunkArray(toolkits, 2).map((pair, rowIndex, allPairs) => (
          <div key={rowIndex} className="grid grid-cols-2 gap-x-8">
            {pair.map((toolkit) => (
              <div
                key={toolkit.slug}
                className={cn(rowIndex < allPairs.length - 1 && "border-b")}
              >
                {renderConnectionCard(toolkit)}
              </div>
            ))}
            {pair.length === 1 && <div />}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <div className="space-y-5">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Connect Apps
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect apps so Sakhi can help you with them
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={connectionSearch}
                onChange={(event) => setConnectionSearch(event.target.value)}
                placeholder="Search apps"
                className={cn(
                  "h-9 rounded-full pl-9 text-sm shadow-none bg-secondary",
                  settingsBtnClass,
                )}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-3xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive shadow-xs">
              {error.message === "Sakhi tools are not configured"
                ? "Add COMPOSIO_API_KEY to your environment to enable app connections."
                : error.message}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-8">
              {[{ rows: 2, isPopular: true }, { rows: 3, isPopular: false }, { rows: 2, isPopular: false }].map((section, sIndex) => (
                <section key={sIndex} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    {section.isPopular
                      ? <><Star className="h-4 w-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Popular</h3></>
                      : <div className="h-4 w-28 animate-pulse rounded bg-muted/50" />
                    }
                  </div>
                  {Array.from({ length: section.rows }).map((_, rowIndex) => (
                    <div key={rowIndex} className={cn("grid grid-cols-2 gap-x-6", rowIndex < section.rows - 1 && "border-b")}>
                      {[0, 1].map((col) => (
                        <div key={col} className="flex animate-pulse items-center gap-3 py-3.5">
                          <div className="size-12 shrink-0 rounded-[14px] bg-muted/50" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-24 rounded bg-muted/50" />
                            <div className="h-3 w-36 rounded bg-muted/50" />
                          </div>
                          <div className="h-8 w-14 shrink-0 rounded-full bg-muted/50" />
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {!normalizedSearch && popularToolkits.length > 0 && (
                <section id="section-popular" className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <Star className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Popular</h3>
                  </div>
                  {renderToolkitList(popularToolkits)}
                </section>
              )}

              {groupedToolkits.length > 0 ? (
                groupedToolkits.map((group) => (
                  <section
                    key={group.category}
                    id={`section-${group.category}`}
                    className="space-y-2"
                  >
                    <h3 className="px-1 text-sm font-semibold">
                      {group.category}
                    </h3>
                    {renderToolkitList(group.toolkits)}
                  </section>
                ))
              ) : (
                <div className="rounded-2xl border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  No apps match your search.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
