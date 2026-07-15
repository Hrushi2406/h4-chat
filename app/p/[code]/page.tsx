"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPromptLink } from "@/lib/services/prompt-link-service";

export default function PromptLinkPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [error, setError] = useState(false);
  const [browserChecked, setBrowserChecked] = useState(false);
  const [isInstagramBrowser, setIsInstagramBrowser] = useState(false);
  const [continueInApp, setContinueInApp] = useState(false);
  const autoEscapeAttempted = useRef(false);
  const externalBrowserFallbackTimer = useRef<number | null>(null);

  useEffect(() => {
    const inApp = /Instagram|FBAN|FBAV/i.test(navigator.userAgent);
    setIsInstagramBrowser(inApp);
    setBrowserChecked(true);

    if (inApp && !autoEscapeAttempted.current) {
      autoEscapeAttempted.current = true;
      openExternalBrowser();
    }

    return clearExternalBrowserFallback;
  }, []);

  useEffect(() => {
    if (
      !code ||
      !browserChecked ||
      (isInstagramBrowser && !continueInApp)
    ) {
      return;
    }

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
  }, [browserChecked, code, continueInApp, isInstagramBrowser, router]);

  function openExternalBrowser() {
    const url = new URL(window.location.href);
    clearExternalBrowserFallback();

    if (/Android/i.test(navigator.userAgent)) {
      const intentTarget = `${url.host}${url.pathname}${url.search}${url.hash}`;
      window.location.href =
        `intent://${intentTarget}` +
        `#Intent;scheme=${url.protocol.slice(0, -1)};` +
        "action=android.intent.action.VIEW;" +
        "category=android.intent.category.BROWSABLE;" +
        `S.browser_fallback_url=${encodeURIComponent(url.toString())};end`;
      return;
    }

    // iOS has no documented escape hatch. x-safari-https:// currently opens
    // Safari from Meta in-app browsers; instagram://extbrowser is a secondary
    // undocumented route. The manual menu instructions remain the fallback.
    window.location.href = `x-safari-${url.toString()}`;
    externalBrowserFallbackTimer.current = window.setTimeout(() => {
      externalBrowserFallbackTimer.current = null;
      if (!document.hidden) {
        window.location.href = `instagram://extbrowser/?url=${encodeURIComponent(url.toString())}`;
      }
    }, 1200);
  }

  function clearExternalBrowserFallback() {
    if (externalBrowserFallbackTimer.current === null) return;
    window.clearTimeout(externalBrowserFallbackTimer.current);
    externalBrowserFallbackTimer.current = null;
  }

  function continueInInstagram() {
    clearExternalBrowserFallback();
    setContinueInApp(true);
  }

  if (browserChecked && isInstagramBrowser && !continueInApp) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Open Sakhi in your browser</h1>
            <p className="text-sm text-muted-foreground">
              For the best experience, continue in an external browser.
            </p>
          </div>

          <Button className="w-full" size="lg" onClick={openExternalBrowser}>
            <ExternalLink aria-hidden="true" />
            Open in external browser
          </Button>

          <p className="text-xs text-muted-foreground">
            If nothing happens, tap the menu in the top-right and choose
            {" “Open in browser”."}
          </p>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={continueInInstagram}
          >
            Continue in Instagram instead
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-center">
      <p className="text-sm text-muted-foreground">
        {error ? "This prompt link could not be found." : "Opening shared prompt…"}
      </p>
    </main>
  );
}
