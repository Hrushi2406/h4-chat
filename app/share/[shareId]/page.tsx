"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeThreadMessage, Thread } from "@/lib/types/thread";
import threadService from "@/lib/services/thread-service";
import { useParams, useRouter } from "next/navigation";
import { MessageList } from "@/components/chat/message-list";
import { Button } from "@/components/ui/button";
import { Settings2, Plus } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { navToolbarSecondaryBtnClass } from "@/lib/utils";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { useConnections } from "@/lib/hooks/connections/use-connections";
import { useMcpServers } from "@/lib/hooks/mcp/use-mcp-servers";

export default function SharedChatPage() {
  const params = useParams<{ shareId: string }>();
  const shareId = params.shareId;
  const router = useRouter();
  const [threadData, setThreadData] = useState<Thread>();
  const [error, setError] = useState<string>();
  const { uid } = useAuth();
  const { data: toolApps = [] } = useConnections(uid);
  const { data: savedMcpServers = [] } = useMcpServers(uid);
  const mcpServers = useMemo(
    () => savedMcpServers.filter((server) => server.enabled),
    [savedMcpServers],
  );
  const messages = useMemo(
    () => threadData?.messages.map(normalizeThreadMessage) ?? [],
    [threadData]
  );

  useEffect(() => {
    if (!shareId) return;

    const fetchThread = async () => {
      try {
        setError(undefined);
        const thread = await threadService.getSharedThread({ shareId });
        setThreadData(thread);
      } catch (error) {
        console.error("Failed to get shared thread: ", { shareId }, error);
        setError("This shared chat could not be found.");
      }
    };
    fetchThread();
  }, [shareId]);

  const handleNewThread = () => {
    router.push("/chat");
  };

  return (
    <div className="flex h-screen min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <div className="flex items-center justify-between flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <img
              src="/saaki-chat-transparent.png"
              alt="Sakhi AI"
              className="h-7 w-7 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">Sakhi AI</h1>
              <p className="truncate text-xs text-muted-foreground md:hidden">
                Shared chat
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PwaInstallButton />
            <ThemeToggle />
            <Button
              variant="secondary"
              size="sm"
              className={navToolbarSecondaryBtnClass}
              onClick={handleNewThread}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="sr-only md:not-sr-only md:inline">
                New Chat
              </span>
            </Button>

            <Button
              asChild
              variant="secondary"
              size="sm"
              className={navToolbarSecondaryBtnClass}
            >
              <Link href="/settings" className="gap-0 md:gap-1.5">
                <Settings2 className="h-4 w-4 shrink-0" />
                <span className="sr-only md:not-sr-only md:inline">
                  Settings
                </span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {error ? (
        <main className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
          <div className="max-w-sm space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              Shared chat unavailable
            </h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </main>
      ) : !threadData ? (
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4">
          <img
            src="/saaki-chat-transparent.png"
            alt="Sakhi AI"
            className="h-12 w-12 object-contain"
          />
          <TextShimmer className="text-sm font-medium leading-loose [--base-color:theme(colors.blue.400)] [--base-gradient-color:theme(colors.blue.600)] dark:[--base-color:theme(colors.blue.700)] dark:[--base-gradient-color:theme(colors.blue.400)]">
            Loading shared chat...
          </TextShimmer>
        </main>
      ) : (
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <MessageList
            threadId={threadData.id}
            messages={messages}
            status="ready"
            toolApps={toolApps}
            mcpServers={mcpServers}
          />
        </main>
      )}
    </div>
  );
}
