"use client";

import { Chat } from "@/components/chat/chat";
import { v4 } from "uuid";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function ChatPage() {
  const pathname = usePathname();
  const [threadId, setThreadId] = useState<string>(v4());
  const [key, setKey] = useState<string>(threadId);

  console.log("key: ", key);

  useEffect(() => {
    if (pathname === "/") {
      const newThreadId = v4();
      setThreadId(newThreadId);
      setKey(newThreadId);
    }
  }, [pathname]);

  return <Chat key={key} threadId={threadId} isNew={true} />;
}
