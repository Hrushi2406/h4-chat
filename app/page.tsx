"use client";

import { Chat } from "@/components/chat/chat";
import { v4 } from "uuid";

export default function ChatPage() {
  const threadId = v4();

  return <Chat threadId={threadId} isNew={true} />;
}
