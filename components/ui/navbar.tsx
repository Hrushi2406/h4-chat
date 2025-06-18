import { Loader2, Plus, Share, Settings } from "lucide-react";
import { Button } from "./button";
import { SidebarTrigger } from "./sidebar";
import { useThreadActions } from "@/lib/hooks/thread/use-thread-actions";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

export default function Navbar() {
  const { shareThread } = useThreadActions();
  const pathname = usePathname();
  const currentThreadId = pathname.split("/").pop() as string;
  const router = useRouter();

  const handleNewThread = () => {
    router.push("/");
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-4 border-b">
      <SidebarTrigger className="-ml-1" />

      <div className="flex items-center justify-between flex-1">
        <h1 className="text-lg font-semibold">Saaki AI</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleNewThread}>
            <Plus className="h-4 w-4" />
            New Thread
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={shareThread.isPending}
            onClick={() => {
              shareThread.mutate({ threadId: currentThreadId });
            }}
          >
            {shareThread.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Share className="h-4 w-4" />
            )}
            Share
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
  );
}
