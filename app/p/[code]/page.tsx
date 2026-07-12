"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPromptLink } from "@/lib/services/prompt-link-service";

export default function PromptLinkPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!code) return;

    getPromptLink(code)
      .then((link) => {
        if (!link) {
          setError(true);
          return;
        }
        sessionStorage.setItem(`shared-${link.mode}`, link.text);
        router.replace("/chat");
      })
      .catch(() => setError(true));
  }, [code, router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-center">
      <p className="text-sm text-muted-foreground">
        {error ? "This prompt link could not be found." : "Opening shared prompt…"}
      </p>
    </main>
  );
}
