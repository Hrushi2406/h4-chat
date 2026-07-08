"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronLeft,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Server,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { useUser } from "@/lib/hooks/user/use-user";
import { useUserActions } from "@/lib/hooks/user/use-user-actions";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { useAuthActions } from "@/lib/hooks/auth/use-auth-actions";
import { getBrowserMcpServers } from "@/lib/mcp-browser";
import { useMcpServers, mcpServerKeys } from "@/lib/hooks/mcp/use-mcp-servers";
import mcpServerService from "@/lib/services/mcp-server-service";
import {
  parseMcpHeadersJson,
  slugifyMcpId,
  type StoredMcpServer,
} from "@/lib/types/mcp-server";
import {
  MAX_MEMORY_CONTENT_LENGTH,
  MAX_USER_MEMORIES,
  type IMemory,
} from "@/lib/types/user";

const settingsCardClass = "rounded-3xl border bg-card text-card-foreground shadow-xs";
const settingsPanelClass = "rounded-3xl border bg-card p-4 text-card-foreground shadow-xs";
const settingsControlClass = "rounded-full shadow-xs";
const settingsBtnClass = "rounded-full";

const SETTINGS_TABS = ["account", "mcp", "memories"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

const isSettingsTab = (value: string): value is SettingsTab =>
  SETTINGS_TABS.includes(value as SettingsTab);

const resolveSettingsTab = (value: string): SettingsTab => {
  if (value === "customization" || value === "connections") return "account";
  return isSettingsTab(value) ? value : "account";
};

function SettingsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "";
  const tabFromUrl = resolveSettingsTab(tabParam);
  const [activeTab, setActiveTab] = React.useState<SettingsTab>(tabFromUrl);

  React.useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  React.useEffect(() => {
    if (tabParam === "customization") {
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", "account");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
  }, [pathname, router, searchParams, tabParam]);

  const handleTabChange = React.useCallback(
    (value: string) => {
      const nextTab = resolveSettingsTab(value);
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
              value="mcp"
              className={cn(settingsBtnClass, "h-8 shrink-0 px-4")}
            >
              MCP
            </TabsTrigger>
            <TabsTrigger
              value="memories"
              className={cn(settingsBtnClass, "h-8 shrink-0 px-4")}
            >
              Memories
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
        <TabsContent value="mcp">
          <Card className={settingsCardClass}>
            <CardContent className="">
              <McpSettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="memories">
          <Card className={settingsCardClass}>
            <CardContent className="">
              <MemorySettings />
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
  const { signOutUser } = useAuthActions();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <section className="flex flex-col rounded-3xl border bg-card p-5 text-card-foreground shadow-xs">
        <div className="flex flex-1 flex-col justify-center">
          <div className="flex flex-col items-center text-center">
            <div className="h-20 w-20 overflow-hidden rounded-full border bg-muted shadow-xs">
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
                  <span className="text-3xl font-medium text-muted-foreground">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || "?"}
                  </span>
                </div>
              )}
            </div>
            <div className="mt-4 min-w-0">
              <p className="truncate font-medium">
                {user?.name || "User"}
              </p>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {user?.email || "No email provided"}
              </p>
            </div>
          </div>

          <div className="mx-auto mt-6 w-full max-w-48">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Usage</p>
              <div className="text-xs text-muted-foreground">{80}/400</div>
            </div>
            <Progress value={25} max={400} className="h-2 w-full" />
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={cn(
            settingsBtnClass,
            "mt-6 h-7 w-full px-2.5 text-xs lg:mt-auto",
          )}
          onClick={() => signOutUser.mutate()}
          disabled={signOutUser.isPending}
        >
          {signOutUser.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5" />
          )}
          Log out
        </Button>
      </section>
      <CustomizationSettings />
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
          <Label htmlFor="display-name">What should Sakhi Chat call you?</Label>
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

const McpSettings = () => {
  const { uid } = useAuth();
  const queryClient = useQueryClient();
  const {
    data: mcpServers = [],
    isLoading,
    refetch,
  } = useMcpServers(uid);
  const [mcpName, setMcpName] = React.useState("");
  const [mcpId, setMcpId] = React.useState("");
  const [mcpUrl, setMcpUrl] = React.useState("");
  const [mcpHeaders, setMcpHeaders] = React.useState("");
  const [mcpTransport, setMcpTransport] =
    React.useState<StoredMcpServer["transport"]>("http");
  const [isSavingMcp, setIsSavingMcp] = React.useState(false);
  const [pendingMcpId, setPendingMcpId] = React.useState<string>();

  React.useEffect(() => {
    if (!uid || mcpServers.length > 0 || isLoading) return;

    const localServers = getBrowserMcpServers();

    if (localServers.length === 0) {
      return;
    }

    Promise.all(
      localServers.map((server) => mcpServerService.saveServer(uid, server)),
    )
      .then(() => refetch())
      .catch((error) => {
        console.error("Failed to migrate local MCP servers:", error);
      });
  }, [isLoading, mcpServers.length, refetch, uid]);

  React.useEffect(() => {
    if (mcpId) return;
    setMcpId(slugifyMcpId(mcpName));
  }, [mcpId, mcpName]);

  const handleAddMcpServer = async () => {
    if (!uid) {
      toast.error("Sign in to save MCP servers");
      return;
    }

    const url = mcpUrl.trim();
    const id = slugifyMcpId(mcpId || mcpName);
    const name = mcpName.trim() || id;
    const headers = parseMcpHeadersJson(mcpHeaders);

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

    setIsSavingMcp(true);

    try {
      await mcpServerService.saveServer(uid, {
        id,
        name,
        url,
        transport: mcpTransport,
        headers,
        enabled: true,
      });
      await queryClient.invalidateQueries({ queryKey: mcpServerKeys.list(uid) });
      setMcpName("");
      setMcpId("");
      setMcpUrl("");
      setMcpHeaders("");
      setMcpTransport("http");
      toast.success(`${name} MCP saved`);
    } catch (error) {
      console.error("Failed to save MCP server:", error);
      toast.error("Unable to save MCP server");
    } finally {
      setIsSavingMcp(false);
    }
  };

  const handleToggleMcpServer = async (
    server: StoredMcpServer,
    enabled: boolean,
  ) => {
    if (!uid) return;

    setPendingMcpId(server.id);

    try {
      await mcpServerService.updateServer(uid, server.id, { enabled });
      await queryClient.invalidateQueries({ queryKey: mcpServerKeys.list(uid) });
    } catch (error) {
      console.error("Failed to update MCP server:", error);
      toast.error("Unable to update MCP server");
    } finally {
      setPendingMcpId(undefined);
    }
  };

  const handleRemoveMcpServer = async (server: StoredMcpServer) => {
    if (!uid) return;

    setPendingMcpId(server.id);

    try {
      await mcpServerService.deleteServer(uid, server.id);
      await queryClient.invalidateQueries({ queryKey: mcpServerKeys.list(uid) });
      toast.success(`${server.name} MCP removed`);
    } catch (error) {
      console.error("Failed to remove MCP server:", error);
      toast.error("Unable to remove MCP server");
    } finally {
      setPendingMcpId(undefined);
    }
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
            variant="secondary"
            onClick={handleAddMcpServer}
            className={cn("self-end border border-input", settingsBtnClass)}
            disabled={isSavingMcp || !uid}
          >
            {isSavingMcp ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
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
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-3xl border bg-card" />
        ) : mcpServers.length === 0 ? (
          <div className="rounded-3xl border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">
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
                  disabled={pendingMcpId === server.id}
                  aria-label={`Toggle ${server.name}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={settingsBtnClass}
                  onClick={() => handleRemoveMcpServer(server)}
                  disabled={pendingMcpId === server.id}
                  aria-label={`Remove ${server.name}`}
                >
                  {pendingMcpId === server.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const MemorySettings = () => {
  const { data: user, isLoading } = useUser();
  const { addMemory, updateMemory, deleteMemory, updateUser } = useUserActions();
  const memories = user?.memories ?? [];
  const memoryEnabled = user?.memoryEnabled !== false;
  const atLimit = memories.length >= MAX_USER_MEMORIES;

  const [newMemory, setNewMemory] = React.useState("");
  const [editingId, setEditingId] = React.useState<string>();
  const [editingContent, setEditingContent] = React.useState("");
  const [memoryToDelete, setMemoryToDelete] = React.useState<IMemory>();

  const handleToggleMemoryEnabled = (enabled: boolean) => {
    if (!user?.uid) return;

    updateUser.mutate({ uid: user.uid, update: { memoryEnabled: enabled } });
  };

  const handleAddMemory = () => {
    const content = newMemory.trim();
    if (!user?.uid || !content || atLimit) return;

    setNewMemory("");
    addMemory.mutate({ uid: user.uid, content });
  };

  const handleStartEdit = (memory: IMemory) => {
    setEditingId(memory.id);
    setEditingContent(memory.content);
  };

  const handleSaveEdit = () => {
    const content = editingContent.trim();

    if (!user?.uid || !editingId) return;
    if (!content) {
      setEditingId(undefined);
      return;
    }

    updateMemory.mutate({ uid: user.uid, memoryId: editingId, content });
    setEditingId(undefined);
  };

  const handleConfirmDelete = () => {
    if (!user?.uid || !memoryToDelete) return;
    deleteMemory.mutate(
      { uid: user.uid, memoryId: memoryToDelete.id },
      { onSuccess: () => setMemoryToDelete(undefined) },
    );
  };

  const rowClass = "flex items-center gap-3 px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl";

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 px-1">
          <div>
            <h2 className="text-xl font-semibold">Memories</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sakhi remembers things you tell it, so it can help you better
              next time.
            </p>
          </div>
          <div className="h-5 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-2xl border bg-card">
          {[0, 1, 2].map((i) => (
            <div key={i} className={rowClass}>
              <div
                className="h-4 animate-pulse rounded bg-muted"
                style={{ width: `${60 - i * 10}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 px-1">
        <div>
          <h2 className="text-xl font-semibold">Memories</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sakhi remembers things you tell it, so it can help you better
            next time.
          </p>
        </div>
        <Switch
          checked={memoryEnabled}
          onCheckedChange={handleToggleMemoryEnabled}
          disabled={updateUser.isPending || !user?.uid}
          aria-label="Toggle memory"
          className="shrink-0 cursor-pointer"
        />
      </div>

      {!memoryEnabled ? (
        <div className="rounded-2xl border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Memory is off. Sakhi won't save or use memories in chats. Your
          existing memories are kept and will return if you turn this back on.
        </div>
      ) : (
        <>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border bg-card">
            {memories.map((memory) =>
              editingId === memory.id ? (
                <div key={memory.id} className={cn(rowClass, "justify-between")}>
                  <input
                    autoFocus
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    maxLength={MAX_MEMORY_CONTENT_LENGTH}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                      if (e.key === "Escape") setEditingId(undefined);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleSaveEdit}
                      aria-label="Save memory"
                      className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setEditingId(undefined)}
                      aria-label="Cancel edit"
                      className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div key={memory.id} className={cn(rowClass, "justify-between")}>
                  <p className="min-w-0 flex-1 truncate text-sm">
                    {memory.content}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(memory)}
                      aria-label="Edit memory"
                      className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemoryToDelete(memory)}
                      aria-label="Delete memory"
                      className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ),
            )}

            {!atLimit && (
              <div className={cn(rowClass, "justify-between")}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    value={newMemory}
                    onChange={(e) => setNewMemory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddMemory();
                    }}
                    placeholder="Add a memory"
                    maxLength={MAX_MEMORY_CONTENT_LENGTH}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                {newMemory.trim() && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleAddMemory}
                    aria-label="Save memory"
                    className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmationDialog
        open={Boolean(memoryToDelete)}
        title="Delete this memory?"
        description={
          memoryToDelete
            ? `Sakhi will forget: "${memoryToDelete.content}"`
            : ""
        }
        confirmLabel="Delete"
        isConfirming={deleteMemory.isPending}
        onCancel={() => setMemoryToDelete(undefined)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
