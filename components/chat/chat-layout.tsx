"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import {
  MessageSquare,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Loader2,
  Settings2,
  Clock,
  PlusSquare,
  Edit,
  Blocks,
  BookOpen,
  Star,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useStarredThreads, useThreads } from "@/lib/hooks/thread/use-threads";
import { useThreadActions } from "@/lib/hooks/thread/use-thread-actions";
import { useState, useMemo } from "react";
import {
  Thread,
  ThreadTimePeriod,
  groupThreadsByTimePeriod,
  getTimePeriodLabel,
} from "@/lib/types/thread";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { useBilling } from "@/lib/hooks/billing/use-billing";
import { cn } from "@/lib/utils";
import Navbar from "../ui/navbar";
import { useUser } from "@/lib/hooks/user/use-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider className="h-mobile-viewport min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 w-full overflow-hidden">
        <ThreadSidebar />
        <SidebarInset className="min-h-0 min-w-0 flex-1">
          <Navbar />
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

const ThreadSidebar = () => {
  const { uid } = useAuth();
  const { data: user } = useUser();
  const { data: billingData } = useBilling();
  const {
    data: threads = [],
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useThreads();
  const { data: starredThreads } = useStarredThreads();
  const router = useRouter();
  const pathname = usePathname();
  const currentThreadId = pathname.split("/").pop() as string;
  const isScheduledTasksActive = pathname.startsWith("/automations");
  const isConnectionsActive = pathname.startsWith("/apps");
  const isHelpersActive = pathname.startsWith("/helpers");
  const { isMobile, setOpenMobile } = useSidebar();

  const { deleteThread } = useThreadActions();

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const handleThreadClick = (threadId: string) => {
    router.push(`/chat/${threadId}`);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleNewThreadClick = () => {
    router.push("/chat");
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleScheduledTasksClick = () => {
    router.push("/automations");
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleHelpersClick = () => {
    router.push("/helpers");
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleConnectionsClick = () => {
    router.push("/apps");
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleDeleteThread = (threadId: string, threadTitle: string) => {
    setThreadToDelete({ id: threadId, title: threadTitle });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!threadToDelete) return;

    try {
      await deleteThread.mutateAsync({ threadId: threadToDelete.id });

      // Navigate to chat home if currently viewing deleted thread
      if (currentThreadId === threadToDelete.id) {
        router.push("/chat");
      }

      setDeleteDialogOpen(false);
      setThreadToDelete(null);
    } catch (error) {
      console.error("Failed to delete thread:", error);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setThreadToDelete(null);
  };

  // Starred chats get their own section, so keep them out of the date groups.
  const groupedThreads = useMemo(() => {
    return groupThreadsByTimePeriod(
      threads.filter((thread) => !thread.isStarred)
    );
  }, [threads]);
  const brandLabel = billingData
    ? `Sakhi ${billingData.billing.planName}`
    : "Sakhi";

  return (
    <>
      <Sidebar>
        <SidebarHeader className="px-2 pb-1 pt-3">
          <div className="flex px-2 items-center gap-2 pb-2">
            <img
              src="/saaki-chat-transparent.png"
              alt="Sakhi AI"
              className="h-7 w-7 object-contain"
            />
            <h2 className="font-semibold">{brandLabel}</h2>
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="New Chat"
                onClick={handleNewThreadClick}
                className="cursor-pointer gap-2.5"
              >
                <Edit className="h-4 w-4" />
                <span>New Chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Apps"
                isActive={isConnectionsActive}
                onClick={handleConnectionsClick}
                className="cursor-pointer gap-2.5"
              >
                <Blocks className="h-4 w-4" />
                <span>Apps</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Helpers"
                isActive={isHelpersActive}
                onClick={handleHelpersClick}
                className="cursor-pointer gap-2.5"
              >
                <BookOpen className="h-4 w-4" />
                <span>Helpers</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Automations"
                isActive={isScheduledTasksActive}
                onClick={handleScheduledTasksClick}
                className="cursor-pointer gap-2.5"
              >
                <Clock className="h-4 w-4" />
                <span>Automations</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="min-h-0 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <>
              <ThreadsListSkeleton />
              <ThreadsLoadingIndicator label="Loading chats..." />
            </>
          ) : !threads.length ? (
            <EmptyState />
          ) : (
            <ThreadsList
              threads={threads}
              groupedThreads={groupedThreads}
              starredThreads={starredThreads}
              currentThreadId={currentThreadId}
              onThreadClick={handleThreadClick}
              onDeleteThread={handleDeleteThread}
              onLoadMore={() => fetchNextPage()}
              hasMoreThreads={!!hasNextPage}
              isLoadingMoreThreads={isFetchingNextPage}
            />
          )}
        </SidebarContent>
        <SidebarFooter className="gap-2 px-2 pb-3 pt-3">
          <SidebarUserFooter
            name={user?.name}
            email={user?.email}
            avatar={user?.avatar}
            fallbackSeed={user?.name || user?.email || uid}
          />
        </SidebarFooter>
      </Sidebar>

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        threadToDelete={threadToDelete}
        isDeleting={deleteThread.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </>
  );
};

interface SidebarUserFooterProps {
  name?: string;
  email?: string;
  avatar?: string;
  fallbackSeed?: string;
}

const SidebarUserFooter = ({
  name,
  email,
  avatar,
  fallbackSeed,
}: SidebarUserFooterProps) => {
  const displayName = name?.trim() || "User";
  const displayEmail = email?.trim() || "No email provided";
  const initials = getUserInitials(fallbackSeed || displayName);

  return (
    <Link
      href="/settings"
      aria-label="Open settings"
      className="flex items-center gap-2 rounded-md px-1 py-0 hover:bg-sidebar-accent"
    >
      <Avatar className="size-7 bg-primary text-primary-foreground">
        {avatar ? (
          <AvatarImage
            src={avatar}
            alt={`${displayName} avatar`}
            className="object-cover"
          />
        ) : null}
        <AvatarFallback className="bg-primary text-xs font-medium uppercase text-primary-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-medium leading-4">{displayName}</p>
        <p className="truncate text-xs leading-4 text-muted-foreground">
          {displayEmail}
        </p>
      </div>

      <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
};

const getUserInitials = (value: string) => {
  const words = value.trim().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

const ThreadsLoadingIndicator = ({ label }: { label: string }) => (
  <div className="px-2 py-3">
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full text-muted-foreground"
      disabled
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </Button>
  </div>
);

const ThreadsListSkeleton = () => (
  <SidebarGroup className="px-2 py-1">
    <SidebarGroupContent>
      <SidebarMenu>
        {Array.from({ length: 6 }).map((_, index) => (
          <SidebarMenuItem key={index}>
            <SidebarMenuSkeleton />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
);

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-6 text-center">
    <MessageSquare className="h-6 w-6 text-muted-foreground mb-2" />
    <p className="text-sm text-muted-foreground">No chats yet</p>
  </div>
);

interface ThreadsListProps {
  groupedThreads: Record<ThreadTimePeriod, Thread[]>;
  threads: Thread[];
  starredThreads: Thread[];
  currentThreadId: string;
  onThreadClick: (threadId: string) => void;
  onDeleteThread: (threadId: string, threadTitle: string) => void;
  onLoadMore: () => void;
  hasMoreThreads: boolean;
  isLoadingMoreThreads: boolean;
}

const ThreadsList = ({
  groupedThreads,
  starredThreads,
  currentThreadId,
  onThreadClick,
  onDeleteThread,
  onLoadMore,
  hasMoreThreads,
  isLoadingMoreThreads,
}: ThreadsListProps) => {
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const timePeriods: ThreadTimePeriod[] = [
    "today",
    "yesterday",
    "last7days",
    "older",
  ];

  React.useEffect(() => {
    const node = loadMoreRef.current;

    if (!node || !hasMoreThreads || isLoadingMoreThreads) {
      return;
    }

    let didRequestNextPage = false;
    const scrollRoot = node.closest('[data-sidebar="content"]');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !didRequestNextPage) {
          didRequestNextPage = true;
          onLoadMore();
        }
      },
      { root: scrollRoot, rootMargin: "120px" },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [hasMoreThreads, isLoadingMoreThreads, onLoadMore]);

  return (
    <div className="min-h-0">
      {starredThreads.length ? (
        <StarredThreadsSection
          starredThreads={starredThreads}
          currentThreadId={currentThreadId}
          onThreadClick={onThreadClick}
          onDeleteThread={onDeleteThread}
        />
      ) : null}
      {timePeriods.map((period) => {
        const threadsInPeriod = groupedThreads[period];
        if (!threadsInPeriod.length) return null;

        return (
          <SidebarGroup key={period} className="px-2 py-1">
            <SidebarGroupLabel className="text-xs text-muted-foreground">
              {getTimePeriodLabel(period)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {threadsInPeriod.map((thread) => (
                  <ThreadItem
                    key={thread.id}
                    thread={thread}
                    isActive={currentThreadId === thread.id}
                    onThreadClick={onThreadClick}
                    onDeleteThread={onDeleteThread}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
      <div ref={loadMoreRef}>
        {hasMoreThreads ? (
          isLoadingMoreThreads ? (
            <ThreadsLoadingIndicator label="Loading older chats..." />
          ) : (
            <div className="px-2 py-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={onLoadMore}
              >
                Load older chats
              </Button>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
};

const STARRED_OPEN_STORAGE_KEY = "sidebar:starred-open";

interface StarredThreadsSectionProps {
  starredThreads: Thread[];
  currentThreadId: string;
  onThreadClick: (threadId: string) => void;
  onDeleteThread: (threadId: string, threadTitle: string) => void;
}

const StarredThreadsSection = ({
  starredThreads,
  currentThreadId,
  onThreadClick,
  onDeleteThread,
}: StarredThreadsSectionProps) => {
  const [isOpen, setIsOpen] = useState(true);

  // Read persisted state after mount so server and client markup stay identical.
  React.useEffect(() => {
    setIsOpen(
      window.localStorage.getItem(STARRED_OPEN_STORAGE_KEY) !== "closed"
    );
  }, []);

  const handleToggle = () => {
    const nextIsOpen = !isOpen;
    setIsOpen(nextIsOpen);
    window.localStorage.setItem(
      STARRED_OPEN_STORAGE_KEY,
      nextIsOpen ? "open" : "closed"
    );
  };

  return (
    <SidebarGroup className="px-2 py-1">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Starred"
            onClick={handleToggle}
            aria-expanded={isOpen}
            className="cursor-pointer gap-2.5"
          >
            <Star className="h-4 w-4 fill-current text-primary" />
            <span>Starred</span>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                !isOpen && "-rotate-90"
              )}
            />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      {isOpen ? (
        <SidebarGroupContent>
          <SidebarMenu>
            {starredThreads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={currentThreadId === thread.id}
                onThreadClick={onThreadClick}
                onDeleteThread={onDeleteThread}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      ) : null}
    </SidebarGroup>
  );
};

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  onThreadClick: (threadId: string) => void;
  onDeleteThread: (threadId: string, threadTitle: string) => void;
}

const ThreadItem = ({
  thread,
  isActive,
  onThreadClick,
  onDeleteThread,
}: ThreadItemProps) => {
  const { updateThread } = useThreadActions();
  const isScheduledTaskThread = Boolean(
    thread.scheduledTaskId || thread.scheduledTaskRunId,
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  const handleEditThread = (currentTitle: string) => {
    setIsEditing(true);
    setEditTitle(currentTitle);
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;

    updateThread.mutate({
      threadId: thread.id,
      title: editTitle.trim(),
    });

    setIsEditing(false);
    setEditTitle("");
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTitle("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  return (
    <SidebarMenuItem>
      <div className="relative" data-threadid={thread.id}>
        {isEditing ? (
          <div className="flex h-8 items-center gap-1 rounded-md bg-sidebar-accent px-2">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-7 bg-background text-sm shadow-none"
              autoFocus
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={handleSaveEdit}
            >
              <Check className="h-4 w-4" />
              <span className="sr-only">Save chat title</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={handleCancelEdit}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Cancel editing chat title</span>
            </Button>
          </div>
        ) : (
          <>
            <SidebarMenuButton
              tooltip={thread.title}
              isActive={isActive}
              className="cursor-pointer group-has-data-[sidebar=menu-action]/menu-item:pr-2"
              onClick={() => onThreadClick(thread.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h3 className="text-sm truncate text-left">{thread.title}</h3>
                {isScheduledTaskThread ? (
                  <Clock
                    className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-automation-icon"
                    aria-label="Automation thread"
                  />
                ) : null}
              </div>
            </SidebarMenuButton>

            <ThreadItemActions
              thread={thread}
              onEditThread={handleEditThread}
              onDeleteThread={onDeleteThread}
            />
          </>
        )}
      </div>
    </SidebarMenuItem>
  );
};

interface ThreadItemActionsProps {
  thread: Thread;
  onEditThread: (currentTitle: string) => void;
  onDeleteThread: (threadId: string, threadTitle: string) => void;
}

const ThreadItemActions = ({
  thread,
  onEditThread,
  onDeleteThread,
}: ThreadItemActionsProps) => {
  const { setThreadStarred } = useThreadActions();
  const isStarred = Boolean(thread.isStarred);

  return (
    <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-sidebar-accent opacity-0 transition-opacity [div[data-threadid]:focus-within_&]:opacity-100 [div[data-threadid]:hover_&]:opacity-100">
      <SidebarMenuAction
        type="button"
        className={`static size-7 translate-y-0 cursor-pointer ${
          isStarred
            ? "text-primary hover:text-primary"
            : "text-muted-foreground hover:text-foreground"
        }`}
        data-starred={isStarred}
        aria-pressed={isStarred}
        onClick={(e) => {
          e.stopPropagation();
          setThreadStarred.mutate({
            threadId: thread.id,
            isStarred: !isStarred,
          });
        }}
      >
        <Star className={`h-4 w-4 ${isStarred ? "fill-current" : ""}`} />
        <span className="sr-only">
          {isStarred ? "Remove chat from starred" : "Star chat"}
        </span>
      </SidebarMenuAction>
      <SidebarMenuAction
        type="button"
        className="static size-7 translate-y-0 cursor-pointer text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onEditThread(thread.title);
        }}
      >
        <Edit2 className="h-4 w-4" />
        <span className="sr-only">Edit chat title</span>
      </SidebarMenuAction>
      <SidebarMenuAction
        type="button"
        className="static size-7 translate-y-0 cursor-pointer text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onDeleteThread(thread.id, thread.title);
        }}
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only">Delete chat</span>
      </SidebarMenuAction>
    </div>
  );
};

interface DeleteConfirmationDialogProps {
  open: boolean;
  threadToDelete: { id: string; title: string } | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmationDialog = ({
  open,
  threadToDelete,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteConfirmationDialogProps) => {
  return (
    <ConfirmationDialog
      open={open}
      title="Delete Chat"
      description={`Are you sure you want to delete "${threadToDelete?.title}"? This action cannot be undone and all messages in this chat will be permanently deleted.`}
      confirmLabel="Delete"
      confirmingLabel="Deleting..."
      isConfirming={isDeleting}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
};
