"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
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
} from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useThreads } from "@/lib/hooks/thread/use-threads";
import { useThreadActions } from "@/lib/hooks/thread/use-thread-actions";
import { useState, useMemo } from "react";
import { Thread } from "@/lib/types/thread";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleNewThread = () => {
    router.push("/");
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <ThreadSidebar />
        <SidebarInset className="flex-1">
          <header className="flex h-16 shrink-0 items-center gap-2 px-4 border-b">
            <SidebarTrigger className="-ml-1" />
            <div className="flex items-center justify-between flex-1">
              <h1 className="text-lg font-semibold">Saaki AI</h1>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleNewThread}>
                  <Plus className="h-4 w-4" />
                  New Thread
                </Button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-hidden">{children}</div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

const ThreadSidebar = () => {
  const { data: threads = [], isLoading } = useThreads();
  const router = useRouter();
  const params = useParams();
  const currentThreadId = params?.threadId as string;
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

  return (
    <>
      <Sidebar variant="inset">
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
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
  <div className="flex items-center justify-center py-6">
    <Loader2 className="h-6 w-6 animate-spin" />
  </div>
);

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-6 text-center">
    <MessageSquare className="h-6 w-6 text-muted-foreground mb-2" />
    <p className="text-sm text-muted-foreground">No threads yet</p>
  </div>
);

interface ThreadsListProps {
  threads: Thread[];
  currentThreadId: string;
  onThreadClick: (threadId: string) => void;
  onDeleteThread: (threadId: string, threadTitle: string) => void;
}

const ThreadsList = ({
  threads,
  currentThreadId,
  onThreadClick,
  onDeleteThread,
}: ThreadsListProps) => {
  return (
    <>
      {threads.map((thread) => {
        return (
          <SidebarMenu>
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={currentThreadId === thread.id}
              onThreadClick={onThreadClick}
              onDeleteThread={onDeleteThread}
            />
          </SidebarMenu>
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
