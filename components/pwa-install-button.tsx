"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { navToolbarSecondaryBtnClass } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallFallback = "local" | "ios" | "mobile" | null;

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

const isMobile = () => {
  if (typeof window === "undefined") return false;

  return window.matchMedia("(max-width: 767px)").matches;
};

export function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installFallback, setInstallFallback] =
    useState<InstallFallback>(null);

  useEffect(() => {
    setIsInstalled(isStandalone());
    setInstallFallback(
      isLocalhost() ? "local" : isIos() ? "ios" : isMobile() ? "mobile" : null,
    );

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();

      if (!isStandalone()) {
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
      if (installFallback === "local") {
        toast.info("Install is available from the deployed app.");
      }

      if (installFallback === "ios") {
        toast.info("Add Sakhi AI to your Home Screen", {
          description:
            "Use the browser share menu, then choose Add to Home Screen.",
        });
      }

      if (installFallback === "mobile") {
        toast.info("Install Sakhi AI from your browser menu", {
          description:
            "Open the browser menu and choose Install app or Add to Home screen.",
        });
      }

      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (isInstalled || (!installPrompt && !installFallback)) return null;

  return (
    <Button
      variant="secondary"
      size="sm"
      className={`${navToolbarSecondaryBtnClass} md:hidden`}
      onClick={handleInstall}
    >
      <Download className="h-4 w-4 shrink-0" />
      <span className="sr-only">Install</span>
    </Button>
  );
}
