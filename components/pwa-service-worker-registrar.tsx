"use client";

import { useEffect } from "react";

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const isLocalhost = () => LOCALHOST_HOSTNAMES.has(window.location.hostname);

export function PwaServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      isLocalhost() ||
      !("serviceWorker" in navigator) ||
      window.location.protocol !== "https:"
    ) {
      return;
    }

    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/sw.js");
    });
  }, []);

  return null;
}
