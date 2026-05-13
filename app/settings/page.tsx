"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  ChevronLeft,
  FileText,
  HardDrive,
  Inbox,
  ListTodo,
  Loader2,
  Plus,
  PlugZap,
  RefreshCw,
  Save,
  Server,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import React from "react";
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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState("account");

  React.useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "connections") {
      setActiveTab("connections");
    }
  }, []);

  return (
    <div className="container py-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex-1">
          <Button variant="outline" className="mb-6 " asChild>
            <Link href="/">
              <ChevronLeft className="w-4 h-4 " />
              Back to chat
            </Link>
          </Button>
        </div>

        <h1 className="text-lg font-bold mb-6 text-center">Settings</h1>
        <div className="flex-1"></div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full ">
        <TabsList className="mb-1">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="customization">Customization</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <Card>
            <CardContent className="">
              <AccountSettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="customization">
          <Card>
            <CardContent className="">
              <CustomizationSettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="connections">
          <Card>
            <CardContent className="">
              <ConnectionsSettings />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const AccountSettings = () => {
  const { data: user } = useUser();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Account Settings</h2>
      <div className="grid gap-4">
        <div className="flex items-center gap-4">
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
          <div className="ml-auto">
            <div className="flex justify-between items-center mb-0">
              <p className="text-xs text-muted-foreground ">Usage</p>
              <div className="flex justify-end text-xs text-muted-foreground">
                {80}/400
              </div>
            </div>

            <div className="flex justify-between items-center mb-2"> </div>
            <Progress value={25} max={400} className="w-48 h-1.5" />
            <p className="text-xs mt-2 text-right text-muted-foreground">
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
    user?.userPreferences || ""
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
    e: React.ChangeEvent<HTMLTextAreaElement>
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
      <h2 className="text-xl font-semibold mb-6">Customization Settings</h2>
      <form onSubmit={handleSaveChanges} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display-name">What should Saaki Chat call you?</Label>
          <div className="flex flex-col gap-1">
            <Input
              id="display-name"
              value={name}
              onChange={handleNameChange}
              placeholder="Enter your name"
              maxLength={50}
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
              className="min-h-[100px] text-sm placeholder:text-sm"
            />
            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">
                {userPreferences.length}/500
              </span>
            </div>
          </div>
        </div>
        <div className="pt-4 flex justify-end">
          <Button
            type="submit"
            disabled={updateUser.isPending}
            className="w-full sm:w-auto"
          >
            {updateUser.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin " />
            ) : (
              <Save className="w-4 h-4 " />
            )}
            Save Changes
          </Button>
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

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    return Object.entries(parsed).reduce<Record<string, string>>(
      (acc, [key, headerValue]) => {
        if (typeof headerValue === "string") {
          acc[key] = headerValue;
        }

        return acc;
      },
      {}
    );
  } catch {
    return null;
  }
};

const ConnectionsSettings = () => {
  const { uid } = useAuth();
  const [pendingSlug, setPendingSlug] = React.useState<string>();
  const [mcpServers, setMcpServers] = React.useState<BrowserMcpServer[]>([]);
  const [mcpName, setMcpName] = React.useState("");
  const [mcpId, setMcpId] = React.useState("");
  const [mcpUrl, setMcpUrl] = React.useState("");
  const [mcpHeaders, setMcpHeaders] = React.useState("");
  const [mcpTransport, setMcpTransport] =
    React.useState<BrowserMcpServer["transport"]>("http");
  const {
    data: toolkits = [],
    error,
    isFetching,
    isLoading,
    refetch,
  } = useConnections(uid);

  React.useEffect(() => {
    setMcpServers(getBrowserMcpServers());
  }, []);

  React.useEffect(() => {
    if (mcpId) {
      return;
    }

    setMcpId(slugifyMcpId(mcpName));
  }, [mcpId, mcpName]);

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
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to start connection");
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
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to disconnect app");
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

  const addMcpServer = () => {
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

      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      toast.error("Enter a valid MCP URL");
      return;
    }

    const nextServers = saveBrowserMcpServer({
      id,
      name,
      url,
      transport: mcpTransport,
      headers,
      enabled: true,
    });

    setMcpServers(nextServers);
    setMcpName("");
    setMcpId("");
    setMcpUrl("");
    setMcpHeaders("");
    setMcpTransport("http");
    toast.success(`${name} MCP connected`);
  };

  const toggleMcpServer = (server: BrowserMcpServer, enabled: boolean) => {
    const nextServers = saveBrowserMcpServer({ ...server, enabled });

    setMcpServers(nextServers);
  };

  const disconnectMcpServer = (server: BrowserMcpServer) => {
    const nextServers = removeBrowserMcpServer(server.id);

    setMcpServers(nextServers);
    toast.success(`${server.name} MCP removed`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">App Connections</h2>
          <p className="text-sm text-muted-foreground">
            Connect apps so chat can handle daily work across your workspace.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching || !uid}
        >
          <RefreshCw
            className={cn("w-4 h-4", isFetching && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
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
                className="h-24 animate-pulse rounded-md border bg-muted/30"
              />
            ))
          : toolkits.map((toolkit) => {
              const Icon = toolkitIcons[toolkit.slug] ?? PlugZap;
              const isPending = pendingSlug === toolkit.slug;

              return (
                <div
                  key={toolkit.slug}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border bg-background">
                      {toolkit.logo ? (
                        <img
                          src={toolkit.logo}
                          alt=""
                          className="h-6 w-6 rounded-sm object-contain"
                        />
                      ) : (
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{toolkit.name}</p>
                        {toolkit.isConnected && (
                          <Badge
                            variant="outline"
                            className="px-2 py-0 text-xs text-emerald-700"
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

      <div className="space-y-3 pt-2">
        <div>
          <h3 className="text-sm font-medium">MCP Servers</h3>
          <p className="text-xs text-muted-foreground">
            Add any remote MCP server with HTTP or SSE transport.
          </p>
        </div>

        <div className="rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_0.8fr]">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-name">Name</Label>
              <Input
                id="mcp-name"
                value={mcpName}
                onChange={(event) => setMcpName(event.target.value)}
                placeholder="Zepto, Linear MCP, Docs"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-id">Tool prefix</Label>
              <Input
                id="mcp-id"
                value={mcpId}
                onChange={(event) => setMcpId(slugifyMcpId(event.target.value))}
                placeholder="zepto"
                className="text-sm"
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-url">Server URL</Label>
              <Input
                id="mcp-url"
                value={mcpUrl}
                onChange={(event) => setMcpUrl(event.target.value)}
                placeholder="https://example.com/mcp"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Transport</Label>
              <Select
                value={mcpTransport}
                onValueChange={(value) =>
                  setMcpTransport(value === "sse" ? "sse" : "http")
                }
              >
                <SelectTrigger className="w-full">
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
              onClick={addMcpServer}
              className="self-end"
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
              onChange={(event) => setMcpHeaders(event.target.value)}
              placeholder='{"Authorization":"Bearer token"}'
              className="min-h-[72px] font-mono text-xs"
            />
          </div>
        </div>

        <div className="space-y-2">
          {mcpServers.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No MCP servers added yet.
            </div>
          ) : (
            mcpServers.map((server) => (
              <div
                key={server.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border bg-background">
                    <Server className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{server.name}</p>
                      <Badge variant="outline" className="px-2 py-0 text-xs">
                        {server.transport.toUpperCase()}
                      </Badge>
                      {server.enabled && (
                        <Badge
                          variant="outline"
                          className="px-2 py-0 text-xs text-emerald-700"
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

                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={(enabled) =>
                      toggleMcpServer(server, enabled)
                    }
                    aria-label={`Toggle ${server.name}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => disconnectMcpServer(server)}
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
    </div>
  );
};
