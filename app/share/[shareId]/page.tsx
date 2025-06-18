"use client";

import { use, useEffect, useState } from "react";
import { Chat } from "@/components/chat/chat";
import { Thread } from "@/lib/types/thread";
import threadService from "@/lib/services/thread-service";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageList } from "@/components/chat/message-list";
import Navbar from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Settings, Plus } from "lucide-react";
import Link from "next/link";

interface SharedChatPageProps {
  params: Promise<{
    shareId: string;
  }>;
}

export default function SharedChatPage({ params }: SharedChatPageProps) {
  const { shareId } = use(params);
  const router = useRouter();
  const [threadData, setThreadData] = useState<Thread>();

  useEffect(() => {
    if (!shareId) return;

    const fetchThread = async () => {
      try {
        const thread = await threadService.getSharedThread({ shareId });
        setThreadData(thread);
      } catch (error) {
        console.error("Failed to get shared thread: ", { shareId }, error);
        toast.error("Shared thread not found");
        router.push("/");
      }
    };
    fetchThread();
  }, [shareId]);

  const handleNewThread = () => {
    router.push("/");
  };

  if (!threadData) return <div>Loading...</div>;

  return (
    <div className="min-h-screen">
      <header className="flex h-12 shrink-0 items-center gap-2 px-4 md:px-6 border-b">
        <div className="flex items-center justify-between flex-1">
          <h1 className="text-lg font-semibold">Saaki AI</h1>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleNewThread}>
              <Plus className="h-4 w-4" />
              New Thread
            </Button>

            <Button asChild variant="secondary" size="sm">
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl ">
        <div className="flex-1 overflow-y-auto">
          <MessageList
            messages={threadData.messages}
            status={"ready"}
            suggestions={[]}
            onSuggestionClick={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
