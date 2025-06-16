"use client";

import { use } from "react";
import { Chat } from "@/components/chat/chat";

interface ChatPageProps {
  params: Promise<{
    threadId: string;
  }>;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { threadId } = use(params);
  return <Chat threadId={threadId} />;
}
