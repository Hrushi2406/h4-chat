"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { navToolbarSecondaryBtnClass } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const isStandalone = () => {
  if (typeof window === "undefined") return false;

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
};

const isLocalhost = () => {
  if (typeof window === "undefined") return false;

  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
};

const isIos = () => {
  if (typeof window === "undefined") return false;

  const platform = window.navigator.platform.toLowerCase();
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isTouchMac =
    platform === "macintel" && window.navigator.maxTouchPoints > 1;

  return /iphone|ipad|ipod/.test(userAgent) || isTouchMac;
};

const isAndroid = () => {
  if (typeof window === "undefined") return false;

  return /android/.test(window.navigator.userAgent.toLowerCase());
};

export function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandalone());
    setPlatform(
      isLocalhost() ? null : isIos() ? "ios" : isAndroid() ? "android" : null,
    );

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();

      if (!isLocalhost() && !isStandalone()) {
        setInstallPrompt(event as BeforeInstallPromptEvent);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    const displayModeQuery = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => {
      setIsInstalled(isStandalone());
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    displayModeQuery.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      displayModeQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      if (platform === "ios") {
        setShowIosInstructions(true);
      }

      return;
    }

    setIsPrompting(true);

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);

      if (choice.outcome === "accepted") {
        setIsInstalled(true);
      }
    } finally {
      setIsPrompting(false);
    }
  };

  const canInstall = platform === "ios" || !!installPrompt;

  if (isInstalled || !canInstall) return null;

  return (
    <Dialog open={showIosInstructions} onOpenChange={setShowIosInstructions}>
      <Button
        variant="secondary"
        size="sm"
        className={navToolbarSecondaryBtnClass}
        aria-label={
          platform === "ios" ? "How to install Sakhi AI" : "Install Sakhi AI"
        }
        aria-busy={isPrompting}
        disabled={isPrompting}
        onClick={handleInstall}
      >
        <Download className="h-4 w-4 shrink-0" />
        <span className="sr-only">Install Sakhi AI</span>
      </Button>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Install Sakhi AI</DialogTitle>
          <DialogDescription>
            Apple requires this final step from Safari.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 text-sm">
          <li className="flex items-center gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-medium">
              1
            </span>
            <span className="flex items-center gap-1.5">
              Tap <Share className="size-4 text-primary" aria-hidden="true" />{" "}
              Share in Safari.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-medium">
              2
            </span>
            <span>
              Choose <strong>Add to Home Screen</strong>, then tap{" "}
              <strong>Add</strong>.
            </span>
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  );
}
