"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  ChevronLeft,
  FileText,
  Globe,
  HardDrive,
  Image,
  Inbox,
  ListTodo,
  Loader2,
  MessageCircle,
  Plus,
  PlugZap,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { Suspense } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUser } from "@/lib/hooks/user/use-user";
import { useUserActions } from "@/lib/hooks/user/use-user-actions";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { auth } from "@/lib/clients/firebase";
import { getApiErrorMessage, readJsonResponse } from "@/lib/api-response";
import {
  ConnectionToolkit,
  useConnections,
} from "@/lib/hooks/connections/use-connections";
import {
  BrowserMcpServer,
  getBrowserMcpServers,
  removeBrowserMcpServer,
  saveBrowserMcpServer,
} from "@/lib/mcp-browser";

const settingsCardClass = "rounded-3xl border shadow-xs";
const settingsPanelClass = "rounded-3xl border bg-card/50 p-4 shadow-xs";
const settingsControlClass = "rounded-full shadow-xs";
const settingsBtnClass = "rounded-full";

const SETTINGS_TABS = [
  "account",
  "customization",
  "connections",
  "mcp",
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

const isSettingsTab = (value: string): value is SettingsTab =>
  SETTINGS_TABS.includes(value as SettingsTab);

function SettingsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "";
  const tabFromUrl: SettingsTab = isSettingsTab(tabParam)
    ? tabParam
    : "account";
  const [activeTab, setActiveTab] = React.useState<SettingsTab>(tabFromUrl);

  React.useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  const handleTabChange = React.useCallback(
    (value: string) => {
      const nextTab = isSettingsTab(value) ? value : "account";
      setActiveTab(nextTab);
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", nextTab);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-0">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex min-w-0 justify-start sm:flex-1 sm:basis-0">
            <Button variant="outline" className={settingsBtnClass} asChild>
              <Link href="/chat">
                <ChevronLeft className="w-4 h-4 " />
                Back to chat
              </Link>
            </Button>
          </div>
          <TabsList className="h-10 w-full max-w-full justify-start overflow-x-auto rounded-full border bg-card p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-fit sm:shrink-0 sm:justify-center">
            <TabsTrigger
              value="account"
              className={cn(settingsBtnClass, "h-8 shrink-0 px-4")}
            >
              Account
            </TabsTrigger>
            <TabsTrigger
              value="customization"
              className={cn(settingsBtnClass, "h-8 shrink-0 px-4")}
            >
              Customization
            </TabsTrigger>
            <TabsTrigger
              value="connections"
              className={cn(settingsBtnClass, "h-8 shrink-0 px-4")}
            >
              Connections
            </TabsTrigger>
            <TabsTrigger
              value="mcp"
              className={cn(settingsBtnClass, "h-8 shrink-0 px-4")}
            >
              MCP
            </TabsTrigger>
          </TabsList>
          <div
            className="hidden min-w-0 sm:block sm:flex-1 sm:basis-0"
            aria-hidden="true"
          />
        </div>
        <TabsContent value="account">
          <Card className={settingsCardClass}>
            <CardContent className="">
              <AccountSettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="customization">
          <Card className={settingsCardClass}>
            <CardContent className="">
              <CustomizationSettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="connections">
          <Card className={settingsCardClass}>
            <CardContent className="">
              <ConnectionsSettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="mcp">
          <Card className={settingsCardClass}>
            <CardContent className="">
              <McpSettings />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-4xl min-h-[40vh] py-6" />
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}

const AccountSettings = () => {
  const { data: user } = useUser();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Account Settings</h2>
      <div className="grid gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="h-12 w-12 rounded-full overflow-hidden">
            {user?.avatar ? (
              <img
                src={user.avatar}
                loading="lazy"
                alt={user?.name || "User avatar"}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src =
                    "https://via.placeholder.com/150?text=Error";
                }}
              />
            ) : (
              <div className="h-full w-full bg-muted flex items-center justify-center">
                <span className="text-xl font-medium text-muted-foreground">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || "?"}
                </span>
              </div>
            )}
          </div>
          <div>
            <p className="font-medium">{user?.name || "Anonymous User"}</p>
            <p className="text-sm text-muted-foreground">
              {user?.email || "No email provided"}
            </p>
          </div>
          <div className="w-full sm:ml-auto sm:w-auto">
            <div className="flex justify-between items-center mb-0">
              <p className="text-xs text-muted-foreground ">Usage</p>
              <div className="flex justify-end text-xs text-muted-foreground">
                {80}/400
              </div>
            </div>

            <div className="flex justify-between items-center mb-2"> </div>
            <Progress value={25} max={400} className="h-2 w-full sm:w-48" />
            <p className="mt-2 text-xs text-muted-foreground sm:text-right">
              Demo usage
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const CustomizationSettings = () => {
  const { data: user } = useUser();
  const { updateUser } = useUserActions();
  const [name, setName] = React.useState(user?.name || "");
  const [occupation, setOccupation] = React.useState(user?.occupation || "");
  const [userPreferences, setUserPreferences] = React.useState(
    user?.userPreferences || "",
  );

  React.useEffect(() => {
    if (user) {
      setName(user.name || "");
      setOccupation(user.occupation || "");
      setUserPreferences(user.userPreferences || "");
    }
  }, [user]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value.slice(0, 50));
  };

  const handleOccupationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOccupation(e.target.value.slice(0, 50));
  };

  const handleUserPreferencesChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setUserPreferences(e.target.value.slice(0, 500));
  };

  const handleSaveChanges = (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.uid) return;

    updateUser.mutate({
      uid: user.uid,
      update: {
        name,
        occupation,
        userPreferences,
      },
    });
  };

  return (
    <div className="">
      <form onSubmit={handleSaveChanges} className="space-y-4">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold sm:text-xl">Customization</h2>
          <Button
            type="submit"
            size="sm"
            disabled={updateUser.isPending}
            className={cn("shrink-0", settingsBtnClass)}
          >
            {updateUser.isPending && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            Save
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="display-name">What should Saaki Chat call you?</Label>
          <div className="flex flex-col gap-1">
            <Input
              id="display-name"
              value={name}
              onChange={handleNameChange}
              placeholder="Enter your name"
              maxLength={50}
              className={settingsControlClass}
            />
            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">
                {name.length}/50
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="occupation">What do you do?</Label>
          <div className="flex flex-col gap-1">
            <Input
              id="occupation"
              value={occupation}
              onChange={handleOccupationChange}
              placeholder="Indie Hacker, Designer, Developer, etc."
              maxLength={50}
              className={settingsControlClass}
            />
            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">
                {occupation.length}/50
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="additional-info">
            Anything else you'd like us to know?
          </Label>
          <div className="flex flex-col gap-1">
            <Textarea
              id="additional-info"
              value={userPreferences}
              onChange={handleUserPreferencesChange}
              placeholder="I love buying new domains every week..."
              maxLength={500}
              className="min-h-[100px] rounded-3xl text-sm shadow-xs placeholder:text-sm"
            />
            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">
                {userPreferences.length}/500
              </span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

const toolkitIcons: Record<string, React.ElementType> = {
  gmail: Inbox,
  googlecalendar: CalendarDays,
  googledrive: HardDrive,
  notion: FileText,
  linear: ListTodo,
  canva: Image,
  whatsapp: MessageCircle,
  browser_tool: Globe,
};

const slugifyMcpId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const parseMcpHeaders = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    return Object.entries(parsed).reduce<Record<string, string>>(
      (acc, [key, headerValue]) => {
        if (typeof headerValue === "string") {
          acc[key] = headerValue;
        }

        return acc;
      },
      {},
    );
  } catch {
    return null;
  }
};

const McpSettings = () => {
  const [mcpServers, setMcpServers] = React.useState<BrowserMcpServer[]>([]);
  const [mcpName, setMcpName] = React.useState("");
  const [mcpId, setMcpId] = React.useState("");
  const [mcpUrl, setMcpUrl] = React.useState("");
  const [mcpHeaders, setMcpHeaders] = React.useState("");
  const [mcpTransport, setMcpTransport] =
    React.useState<BrowserMcpServer["transport"]>("http");

  React.useEffect(() => {
    setMcpServers(getBrowserMcpServers());
  }, []);

  React.useEffect(() => {
    if (mcpId) return;
    setMcpId(slugifyMcpId(mcpName));
  }, [mcpId, mcpName]);

  const handleAddMcpServer = () => {
    const url = mcpUrl.trim();
    const id = slugifyMcpId(mcpId || mcpName);
    const name = mcpName.trim() || id;
    const headers = parseMcpHeaders(mcpHeaders);

    if (!id) {
      toast.error("Give this MCP a name");
      return;
    }
    if (headers === null) {
      toast.error("Headers must be valid JSON");
      return;
    }
    if (!url) {
      toast.error("Paste the MCP server URL first");
      return;
    }

    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      toast.error("Enter a valid MCP URL");
      return;
    }

    setMcpServers(
      saveBrowserMcpServer({
        id,
        name,
        url,
        transport: mcpTransport,
        headers,
        enabled: true,
      }),
    );
    setMcpName("");
    setMcpId("");
    setMcpUrl("");
    setMcpHeaders("");
    setMcpTransport("http");
    toast.success(`${name} MCP connected`);
  };

  const handleToggleMcpServer = (server: BrowserMcpServer, enabled: boolean) =>
    setMcpServers(saveBrowserMcpServer({ ...server, enabled }));

  const handleRemoveMcpServer = (server: BrowserMcpServer) => {
    setMcpServers(removeBrowserMcpServer(server.id));
    toast.success(`${server.name} MCP removed`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">MCP Servers</h2>
        <p className="text-sm text-muted-foreground">
          Add any remote MCP server with HTTP or SSE transport.
        </p>
      </div>

      <div className={settingsPanelClass}>
        <div className="grid gap-3 sm:grid-cols-[1fr_0.8fr]">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-name">Name</Label>
            <Input
              id="mcp-name"
              value={mcpName}
              onChange={(e) => setMcpName(e.target.value)}
              placeholder="Zepto, Linear MCP, Docs"
              className={cn(settingsControlClass, "text-sm")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-id">Tool prefix</Label>
            <Input
              id="mcp-id"
              value={mcpId}
              onChange={(e) => setMcpId(slugifyMcpId(e.target.value))}
              placeholder="zepto"
              className={cn(settingsControlClass, "text-sm")}
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-url">Server URL</Label>
            <Input
              id="mcp-url"
              value={mcpUrl}
              onChange={(e) => setMcpUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className={cn(settingsControlClass, "text-sm")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Transport</Label>
            <Select
              value={mcpTransport}
              onValueChange={(v) =>
                setMcpTransport(v === "sse" ? "sse" : "http")
              }
            >
              <SelectTrigger className={cn("w-full", settingsControlClass)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="sse">SSE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={handleAddMcpServer}
            className={cn("self-end", settingsBtnClass)}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="mcp-headers">Headers JSON</Label>
          <Textarea
            id="mcp-headers"
            value={mcpHeaders}
            onChange={(e) => setMcpHeaders(e.target.value)}
            placeholder='{"Authorization":"Bearer token"}'
            className="min-h-[72px] rounded-3xl font-mono text-xs shadow-xs"
          />
        </div>
      </div>

      <div className="space-y-2">
        {mcpServers.length === 0 ? (
          <div className="rounded-3xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            No MCP servers added yet.
          </div>
        ) : (
          mcpServers.map((server) => (
            <div
              key={server.id}
              className={cn(
                "flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between",
                settingsPanelClass,
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg border bg-background shadow-xs">
                  <Server className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{server.name}</p>
                    <Badge
                      variant="outline"
                      className={cn(settingsBtnClass, "px-3 py-0.5 text-xs")}
                    >
                      {server.transport.toUpperCase()}
                    </Badge>
                    {server.enabled && (
                      <Badge
                        variant="outline"
                        className={cn(
                          settingsBtnClass,
                          "px-3 py-0.5 text-xs text-emerald-700",
                        )}
                      >
                        Enabled
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    mcp_{server.id}_* / {server.url}
                  </p>
                </div>
              </div>

              <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:shrink-0 sm:justify-start">
                <Switch
                  checked={server.enabled}
                  onCheckedChange={(enabled) =>
                    handleToggleMcpServer(server, enabled)
                  }
                  aria-label={`Toggle ${server.name}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={settingsBtnClass}
                  onClick={() => handleRemoveMcpServer(server)}
                  aria-label={`Remove ${server.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const ConnectionsSettings = () => {
  const { uid } = useAuth();
  const [pendingSlug, setPendingSlug] = React.useState<string>();
  const {
    data: toolkits = [],
    error,
    isFetching,
    isLoading,
    refetch,
  } = useConnections(uid);

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold sm:text-xl">App Connections</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("shrink-0", settingsBtnClass)}
          onClick={() => refetch()}
          disabled={isFetching || !uid}
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive shadow-xs">
          {error.message === "Composio is not configured"
            ? "Add COMPOSIO_API_KEY to your environment to enable app connections."
            : error.message}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-3xl border bg-muted/30"
              />
            ))
          : toolkits.map((toolkit) => {
              const Icon = toolkitIcons[toolkit.slug] ?? PlugZap;
              const isPending = pendingSlug === toolkit.slug;

              return (
                <div
                  key={toolkit.slug}
                  className={cn(
                    "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden",
                    settingsPanelClass,
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg border bg-background shadow-xs">
                      {toolkit.logo ? (
                        <img
                          src={toolkit.logo}
                          alt=""
                          className="size-6 object-contain rounded-xs"
                        />
                      ) : (
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate font-medium">{toolkit.name}</p>
                        {toolkit.isConnected && (
                          <Badge
                            variant="outline"
                            className={cn(
                              settingsBtnClass,
                              "hidden px-3 py-0.5 text-xs text-emerald-700 sm:inline-flex",
                            )}
                          >
                            Connected
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {toolkit.providerName}
                        {toolkit.status ? ` / ${toolkit.status}` : ""}
                      </p>
                    </div>
                  </div>

                  {toolkit.isConnected ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn("shrink-0", settingsBtnClass)}
                      onClick={() => disconnect(toolkit)}
                      disabled={Boolean(pendingSlug)}
                    >
                      {isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Disconnect"
                      )}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant={"secondary"}
                      className={cn("shrink-0 border", settingsBtnClass)}
                      onClick={() => connect(toolkit.slug)}
                      disabled={Boolean(pendingSlug)}
                    >
                      {isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
      </div>
    </div>
  );
};
