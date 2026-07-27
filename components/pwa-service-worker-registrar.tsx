"use client";

import { useEffect } from "react";

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function PwaServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      LOCALHOST_HOSTNAMES.has(window.location.hostname) ||
      !("serviceWorker" in navigator) ||
      !window.isSecureContext
    ) {
      return;
    }

    const registerServiceWorker = () => {
      void navigator.serviceWorker.register("/sw.js");
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
      return;
    }

    window.addEventListener("load", registerServiceWorker, { once: true });

    return () => {
      window.removeEventListener("load", registerServiceWorker);
    };
  }, []);

  return null;
}
