"use client";

import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/clients/query-client";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { useEffect, useRef } from "react";
import { userQueryOptions } from "@/lib/hooks/user/use-user";
import { connectionsQueryOptions } from "@/lib/hooks/connections/use-connections";
import { usePathname, useRouter } from "next/navigation";
import { PwaServiceWorkerRegistrar } from "@/components/pwa-service-worker-registrar";
import { getFirebaseAnalytics } from "@/lib/clients/firebase-analytics";

interface ClientProviderProps {
  children: React.ReactNode;
}

export const ClientProvider = ({ children }: ClientProviderProps) => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        themes={[
          "light",
          "dark",
          "matcha",
          "graphite",
          "ocean",
          "jaipur-pink",
          "jaipur",
          "luxury",
        ]}
        disableTransitionOnChange={false}
      >
        <PwaServiceWorkerRegistrar />
        <AuthProvider>{children}</AuthProvider>
        <Toaster richColors />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { uid, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const shouldRedirectHomeToChat = pathname === "/" && !!uid;
  const previousUidRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!uid) {
      if (previousUidRef.current) {
        queryClient.clear();
      }
      previousUidRef.current = undefined;
      return;
    }

    previousUidRef.current = uid;
    void queryClient.prefetchQuery(userQueryOptions(uid));
    void queryClient.prefetchQuery(connectionsQueryOptions(uid));
  }, [queryClient, uid]);

  useEffect(() => {
    let isCurrent = true;

    void getFirebaseAnalytics().then(async (analytics) => {
      if (!analytics || !isCurrent) return;

      const { setUserId } = await import("firebase/analytics");
      if (isCurrent) setUserId(analytics, uid ?? null);
    });

    return () => {
      isCurrent = false;
    };
  }, [uid]);

  useEffect(() => {
    if (shouldRedirectHomeToChat) {
      router.replace("/chat");
    }
  }, [router, shouldRedirectHomeToChat]);

  if (shouldRedirectHomeToChat) return null;

  if (isLoading) return null;

  console.log("uid: ", uid);
  return <>{children}</>;
};
