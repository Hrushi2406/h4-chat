"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
  Pencil,
  Plug,
  Plus,
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
  const { updateUser } = useUserActions();
  const { signOutUser } = useAuthActions();
  const [name, setName] = React.useState(user?.name || "");
  const [occupation, setOccupation] = React.useState(user?.occupation || "");
  const [userPreferences, setUserPreferences] = React.useState(
    user?.userPreferences || "",
  );
  const [isSigningOutConfirmOpen, setIsSigningOutConfirmOpen] =
    React.useState(false);

  React.useEffect(() => {
    if (user) {
      setName(user.name || "");
      setOccupation(user.occupation || "");
      setUserPreferences(user.userPreferences || "");
    }
  }, [user]);

  const isDirty =
    name !== (user?.name || "") ||
    occupation !== (user?.occupation || "") ||
    userPreferences !== (user?.userPreferences || "");

  const handleDiscardChanges = () => {
    setName(user?.name || "");
    setOccupation(user?.occupation || "");
    setUserPreferences(user?.userPreferences || "");
  };

  const handleSaveChanges = () => {
    if (!user?.uid) return;

    updateUser.mutate({
      uid: user.uid,
      update: { name, occupation, userPreferences },
    });
  };

  const iosListClass =
    "overflow-hidden rounded-[20px] bg-muted/50 divide-y divide-border/70";
  const iosRowClass =
    "flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-foreground/[0.03] focus-within:bg-foreground/[0.03]";

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-stretch lg:gap-6">
      <div className="flex flex-col gap-4 lg:gap-3">
        <section className="flex flex-col items-center gap-3 rounded-[20px] bg-muted/50 p-5 text-center">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
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
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <span className="text-xl font-medium text-muted-foreground">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || "?"}
                </span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold leading-tight">
              {user?.name || "User"}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              {user?.email || "No email provided"}
            </p>
          </div>
        </section>

        <div className="hidden lg:mt-auto lg:block">
          <div className={iosListClass}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsSigningOutConfirmOpen(true)}
              className="h-11 w-full rounded-none text-[15px] font-medium text-destructive hover:bg-transparent hover:text-destructive"
            >
              Log out
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:gap-6">
        <div className="space-y-1.5">
          <div className={iosListClass}>
            <label htmlFor="display-name" className={cn(iosRowClass, "cursor-text group")}>
              <span className="w-24 shrink-0 text-[15px]">Name</span>
              <Input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 50))}
                placeholder="Not set"
                maxLength={50}
                className="h-auto flex-1 border-none bg-transparent px-0 text-right text-[15px] shadow-none focus-visible:ring-0"
              />
              <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
            </label>
            <label htmlFor="occupation" className={cn(iosRowClass, "cursor-text group")}>
              <span className="w-24 shrink-0 text-[15px]">Occupation</span>
              <Input
                id="occupation"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value.slice(0, 50))}
                placeholder="Not set"
                maxLength={50}
                className="h-auto flex-1 border-none bg-transparent px-0 text-right text-[15px] shadow-none focus-visible:ring-0"
              />
              <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
            </label>
            <label
              htmlFor="additional-info"
              className="group block cursor-text px-4 py-2.5 transition-colors hover:bg-foreground/[0.03] focus-within:bg-foreground/[0.03]"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[15px]">About you</span>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
              </div>
              <Textarea
                id="additional-info"
                value={userPreferences}
                onChange={(e) =>
                  setUserPreferences(e.target.value.slice(0, 500))
                }
                placeholder="Tell Sakhi anything worth remembering..."
                maxLength={500}
                className="mt-1.5 min-h-[72px] resize-none border-none bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0"
              />
            </label>
          </div>
          {isDirty && (
            <div className="flex items-center justify-end gap-2 px-1 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDiscardChanges}
                disabled={updateUser.isPending}
                className="h-8 px-3 text-[13px] font-medium text-muted-foreground"
              >
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveChanges}
                disabled={updateUser.isPending}
                className="h-8 rounded-full px-4 text-[13px] font-semibold shadow-sm"
              >
                {updateUser.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Save changes
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5 lg:hidden">
          <div className={iosListClass}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsSigningOutConfirmOpen(true)}
              className="h-11 w-full rounded-none text-[15px] font-medium text-destructive hover:bg-transparent hover:text-destructive"
            >
              Log out
            </Button>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        open={isSigningOutConfirmOpen}
        title="Log out of Sakhi?"
        description="You'll need to sign in again to access your chats and memories."
        confirmLabel="Log out"
        isConfirming={signOutUser.isPending}
        onCancel={() => setIsSigningOutConfirmOpen(false)}
        onConfirm={() => {
          signOutUser.mutate(undefined, {
            onSuccess: () => setIsSigningOutConfirmOpen(false),
          });
        }}
      />
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
  const [isAdding, setIsAdding] = React.useState(false);
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
      setIsAdding(false);
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

  const mcpRowClass =
    "flex items-center gap-3 px-4 py-3.5 first:rounded-t-2xl last:rounded-b-2xl";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 px-1">
        <div>
          <h2 className="text-xl font-semibold">MCP Servers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a remote MCP server over HTTP or SSE to extend what Sakhi
            can do.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        {isLoading ? (
          <div className={mcpRowClass}>
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {mcpServers.length === 0 && !isAdding && (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto grid size-11 place-items-center rounded-full bg-muted">
                  <Plug className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  No MCP servers connected yet.
                </p>
              </div>
            )}
            {mcpServers.map((server) => (
              <div key={server.id} className={cn(mcpRowClass, "gap-4")}>
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
                  <Plug className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {server.name}
                    </p>
                    <span className="shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground">
                      {server.transport.toUpperCase()}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {server.url}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={(enabled) =>
                      handleToggleMcpServer(server, enabled)
                    }
                    disabled={pendingMcpId === server.id}
                    aria-label={`Toggle ${server.name}`}
                    className="cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveMcpServer(server)}
                    disabled={pendingMcpId === server.id}
                    aria-label={`Remove ${server.name}`}
                    className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {pendingMcpId === server.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}

            {!isAdding && (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                disabled={!uid}
                className={cn(mcpRowClass, "w-full cursor-pointer text-left disabled:opacity-50")}
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="flex-1 text-sm font-medium">
                  Add MCP server
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            )}
          </div>
        )}
      </div>

      {isAdding && (
        <div className={cn(settingsPanelClass, "space-y-4")}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">New server</p>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              aria-label="Cancel"
              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

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

          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mcp-headers">Headers JSON</Label>
            <Textarea
              id="mcp-headers"
              value={mcpHeaders}
              onChange={(e) => setMcpHeaders(e.target.value)}
              placeholder='{"Authorization":"Bearer token"}'
              className="min-h-[72px] rounded-2xl font-mono text-xs shadow-xs"
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleAddMcpServer}
              className={cn(settingsBtnClass, "px-5")}
              disabled={isSavingMcp || !uid}
            >
              {isSavingMcp && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Add server
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const MemorySettings = () => {
  const { data: user, isLoading, refetch } = useUser();
  const { addMemory, updateMemory, deleteMemory, updateUser } = useUserActions();
  const memories = user?.memories ?? [];
  const memoryEnabled = user?.memoryEnabled !== false;
  const atLimit = memories.length >= MAX_USER_MEMORIES;

  React.useEffect(() => {
    refetch();
  }, [refetch]);

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
              Sakhi picks up things about you as you chat, so it can help
              you better next time.
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
            Sakhi picks up things about you as you chat, so it can help
            you better next time.
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
