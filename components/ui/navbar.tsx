import {
  Loader2,
  MoreHorizontal,
  Plus,
  Share,
  Settings2,
  Star,
} from "lucide-react";
import { Button } from "./button";
import { SidebarTrigger } from "./sidebar";
import { useThreadActions } from "@/lib/hooks/thread/use-thread-actions";
import { useThread } from "@/lib/hooks/thread/use-threads";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { navToolbarSecondaryBtnClass } from "@/lib/utils";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { WhatsAppLogo } from "@/lib/brand-logos";
import { WHATSAPP_COMMUNITY_URL } from "@/lib/constants";
import { CreditMeter } from "@/components/billing/credit-meter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const THREAD_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getThreadIdFromPathname = (pathname: string) => {
  const match = pathname.match(/^\/chat\/([^/]+)\/?$/);
  const threadId = match?.[1];
  return threadId && THREAD_ID_RE.test(threadId) ? threadId : undefined;
};

export default function Navbar() {
  const { shareThread, setThreadStarred } = useThreadActions();
  const pathname = usePathname();
  const currentThreadId = getThreadIdFromPathname(pathname);
  const { data: currentThread } = useThread(currentThreadId ?? "");
  const router = useRouter();
  const isStarred = Boolean(currentThread?.isStarred);

  const handleNewThread = () => {
    router.push("/chat");
  };

  const handleShare = () => {
    if (!currentThreadId) return;
    shareThread.mutate({ threadId: currentThreadId });
  };

  const handleToggleStar = () => {
    if (!currentThreadId) return;
    setThreadStarred.mutate({
      threadId: currentThreadId,
      isStarred: !isStarred,
    });
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 md:border-b-0">
      <SidebarTrigger className="-ml-1" />

      <div className="flex items-center justify-between flex-1">
        <h1 className="text-lg font-semibold">Sakhi</h1>
        <div className="flex items-center gap-2">
          <CreditMeter />
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
          {currentThreadId ? (
            <Button
              variant="secondary"
              size="sm"
              className={navToolbarSecondaryBtnClass}
              aria-pressed={isStarred}
              aria-label={isStarred ? "Remove chat from starred" : "Star chat"}
              data-starred={isStarred}
              onClick={handleToggleStar}
            >
              <Star
                className={`h-4 w-4 shrink-0 ${
                  isStarred ? "fill-current text-primary" : ""
                }`}
              />
              <span className="sr-only md:not-sr-only md:inline">
                {isStarred ? "Starred" : "Star"}
              </span>
            </Button>
          ) : null}
          {currentThreadId ? (
            <Button
              variant="secondary"
              size="sm"
              className={navToolbarSecondaryBtnClass}
              disabled={shareThread.isPending}
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
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Open menu"
                className={navToolbarSecondaryBtnClass}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="w-60 rounded-xl p-2"
            >
              <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Menu
              </DropdownMenuLabel>
              <DropdownMenuItem asChild className="gap-2 rounded-lg">
                <a
                  href={WHATSAPP_COMMUNITY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsAppLogo className="size-4 text-muted-foreground" />
                  Join Community
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="gap-2 rounded-lg">
                <Link href="/settings">
                  <Settings2 className="size-4 text-muted-foreground" />
                  Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
