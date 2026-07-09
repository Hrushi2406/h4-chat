"use client";

import { Chat } from "@/components/chat/chat";
import { v4 } from "uuid";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function ChatPage() {
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const [threadId, setThreadId] = useState(() => v4());
  const [key, setKey] = useState(() => threadId);

  useEffect(() => {
    const wasOnNewChat = previousPathnameRef.current === "/chat";
    previousPathnameRef.current = pathname;

    // Remount only when navigating to /chat from another route
    if (pathname === "/chat" && !wasOnNewChat) {
      const newThreadId = v4();
      setThreadId(newThreadId);
      setKey(newThreadId);
    }
  }, [pathname]);

  return <Chat key={key} threadId={threadId} isNew={true} />;
}
