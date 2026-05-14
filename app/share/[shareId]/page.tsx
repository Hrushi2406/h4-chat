"use client";

import { useEffect, useState } from "react";
import { Thread } from "@/lib/types/thread";
import threadService from "@/lib/services/thread-service";
import { useParams, useRouter } from "next/navigation";
import { MessageList } from "@/components/chat/message-list";
import { Button } from "@/components/ui/button";
import { Settings2, Plus } from "lucide-react";
import Link from "next/link";

export default function SharedChatPage() {
  const params = useParams<{ shareId: string }>();
  const shareId = params.shareId;
  const router = useRouter();
  const [threadData, setThreadData] = useState<Thread>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!shareId) return;

    const fetchThread = async () => {
      try {
        setError(undefined);
        const thread = await threadService.getSharedThread({ shareId });
        setThreadData(thread);
      } catch (error) {
        console.error("Failed to get shared thread: ", { shareId }, error);
        setError("This shared thread could not be found.");
      }
    };
    fetchThread();
  }, [shareId]);

  const handleNewThread = () => {
    router.push("/");
  };

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 px-4 md:px-6 border-b">
        <div className="flex items-center justify-between flex-1">
          <h1 className="text-lg font-semibold">Saaki AI</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full border shadow-none"
              onClick={handleNewThread}
            >
              <Plus className="h-4 w-4" />
              New Thread
            </Button>

            <Button
              asChild
              variant="secondary"
              size="sm"
              className="rounded-full border shadow-none"
            >
              <Link href="/settings">
                <Settings2 className="h-4 w-4" />
                Settings
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {error ? (
        <main className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {error}
        </main>
      ) : !threadData ? (
        <main className="flex flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
          Loading shared thread...
        </main>
      ) : (
        <main className="min-h-0 flex-1">
          <MessageList
            threadId={threadData.id}
            messages={threadData.messages}
            status={"ready"}
          />
        </main>
      )}
    </div>
  );
}
