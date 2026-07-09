import { Loader2, Plus, Share, Settings2 } from "lucide-react";
import { Button } from "./button";
import { SidebarTrigger } from "./sidebar";
import { useThreadActions } from "@/lib/hooks/thread/use-thread-actions";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { navToolbarSecondaryBtnClass } from "@/lib/utils";
import { PwaInstallButton } from "@/components/pwa-install-button";

const THREAD_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getThreadIdFromPathname = (pathname: string) => {
  const match = pathname.match(/^\/chat\/([^/]+)\/?$/);
  const threadId = match?.[1];
  return threadId && THREAD_ID_RE.test(threadId) ? threadId : undefined;
};

export default function Navbar() {
  const { shareThread } = useThreadActions();
  const pathname = usePathname();
  const currentThreadId = getThreadIdFromPathname(pathname);
  const router = useRouter();

  const handleNewThread = () => {
    router.push("/chat");
  };

  const handleShare = () => {
    if (!currentThreadId) return;
    shareThread.mutate({ threadId: currentThreadId });
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 md:border-b-0">
      <SidebarTrigger className="-ml-1" />

      <div className="flex items-center justify-between flex-1">
        <h1 className="text-lg font-semibold">Sakhi</h1>
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
            <span className="sr-only md:not-sr-only md:inline">New Chat</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className={navToolbarSecondaryBtnClass}
            disabled={!currentThreadId || shareThread.isPending}
            aria-busy={shareThread.isPending}
            onClick={handleShare}
          >
            {shareThread.isPending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Share className="h-4 w-4 shrink-0" />
            )}
            <span className="sr-only md:not-sr-only md:inline">Share</span>
          </Button>
          <Button
            asChild
            variant="secondary"
            size="sm"
            className={navToolbarSecondaryBtnClass}
          >
            <Link href="/settings" className="gap-0 md:gap-1.5">
              <Settings2 className="h-4 w-4 shrink-0" />
              <span className="sr-only md:not-sr-only md:inline">Settings</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
