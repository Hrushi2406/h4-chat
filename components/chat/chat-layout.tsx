"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogFooter,
  AlertDialogContent,
  AlertDialogCancel,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  Settings,
  MessageSquare,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Loader2,
  Share,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useThreads } from "@/lib/hooks/thread/use-threads";
import { useThreadActions } from "@/lib/hooks/thread/use-thread-actions";
import { useState, useMemo } from "react";
import {
  Thread,
  ThreadTimePeriod,
  groupThreadsByTimePeriod,
  getTimePeriodLabel,
} from "@/lib/types/thread";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import Navbar from "../ui/navbar";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <ThreadSidebar />
        <SidebarInset className="flex-1">
          <Navbar />
          <div className="flex-1 overflow-hidden">{children}</div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

const ThreadSidebar = () => {
  const { uid } = useAuth();
  const { data: threads = [], isLoading } = useThreads();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const currentThreadId = pathname.split("/").pop() as string;

  const { deleteThread } = useThreadActions();

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const handleThreadClick = (threadId: string) => {
    router.push(`/chat/${threadId}`);
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
        router.push("/");
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

  const groupedThreads = useMemo(() => {
    return groupThreadsByTimePeriod(threads);
  }, [threads]);

  return (
    <>
      <Sidebar variant="inset">
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <img
              src="/saaki-chat-transparent.png"
              alt="Saaki AI"
              className="h-7 w-7 object-contain"
            />
            <h2 className="font-semibold">Threads</h2>
          </div>
          <div className="py-2">
            <Button
              className="w-full"
              variant="outline"
              size="sm"
              onClick={() => router.push("/")}
            >
              <Plus className="h-4 w-4" />
              New Thread
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {isLoading ? (
            <LoadingState />
          ) : !threads.length ? (
            <EmptyState />
          ) : (
            <ThreadsList
              threads={threads}
              groupedThreads={groupedThreads}
              currentThreadId={currentThreadId}
              onThreadClick={handleThreadClick}
              onDeleteThread={handleDeleteThread}
            />
          )}
        </SidebarContent>
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

const LoadingState = () => (
  <div className="flex flex-col items-center justify-center py-6 text-center">
    <Loader2 className="h-6 w-6 text-muted-foreground mb-2 animate-spin" />
    <p className="text-sm text-muted-foreground">Loading threads...</p>
  </div>
);

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-6 text-center">
    <MessageSquare className="h-6 w-6 text-muted-foreground mb-2" />
    <p className="text-sm text-muted-foreground">No threads yet</p>
  </div>
);

interface ThreadsListProps {
  groupedThreads: Record<ThreadTimePeriod, Thread[]>;
  threads: Thread[];
  currentThreadId: string;
  onThreadClick: (threadId: string) => void;
  onDeleteThread: (threadId: string, threadTitle: string) => void;
}

const ThreadsList = ({
  groupedThreads,
  currentThreadId,
  onThreadClick,
  onDeleteThread,
}: ThreadsListProps) => {
  const timePeriods: ThreadTimePeriod[] = [
    "today",
    "yesterday",
    "last7days",
    "older",
  ];

  return (
    <>
      {timePeriods.map((period) => {
        const threadsInPeriod = groupedThreads[period];
        if (!threadsInPeriod.length) return null;

        return (
          <SidebarGroup key={period} className="px-0 py-1">
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
    </>
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
      <div
        className="relative hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-md"
        data-threadid={thread.id}
      >
        {isEditing ? (
          <div className="flex items-center gap-1 px-3 py-1.5">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-6 text-sm"
              autoFocus
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleSaveEdit}
            >
              <Check className="h-3 w-3 text-green-600" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleCancelEdit}
            >
              <X className="h-3 w-3 text-red-600" />
            </Button>
          </div>
        ) : (
          <>
            <SidebarMenuButton
              tooltip={thread.title}
              className={`flex items-center hover:bg-neutral-200 dark:hover:bg-neutral-800 justify-between w-full px-3 py-1.5 cursor-pointer ${
                isActive
                  ? "bg-neutral-200 dark:bg-neutral-800 text-foreground font-medium"
                  : ""
              }`}
              onClick={() => onThreadClick(thread.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h3 className="text-sm truncate text-left">{thread.title}</h3>
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
  return (
    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex bg-neutral-200 dark:bg-neutral-800 items-center gap-1 opacity-0 [div[data-threadid]:hover_&]:opacity-100 rounded-md">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={(e) => {
          e.stopPropagation();
          onEditThread(thread.title);
        }}
      >
        <Edit2 className="h-3 w-3 text-muted-foreground" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onDeleteThread(thread.id, thread.title);
        }}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
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
    <AlertDialog open={open} onOpenChange={onCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Thread</AlertDialogTitle>
          <AlertDialogDescription>
            {`Are you sure you want to delete "${threadToDelete?.title}"? This action cannot be undone and all messages in this thread will be permanently deleted.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel aria-label="Cancel deletion">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            aria-label="Confirm delete thread"
          >
            {isDeleting ? (
              <>
                {/* Loader2 import from 'lucide-react' is required */}
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
