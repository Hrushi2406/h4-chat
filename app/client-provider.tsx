"use client";

import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/clients/query-client";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { useEffect } from "react";
import { userQueryOptions } from "@/lib/hooks/user/use-user";
import { connectionsQueryOptions } from "@/lib/hooks/connections/use-connections";
import { usePathname, useRouter } from "next/navigation";
import { PwaServiceWorkerRegistrar } from "@/components/pwa-service-worker-registrar";

interface ClientProviderProps {
  children: React.ReactNode;
}

export const ClientProvider = ({ children }: ClientProviderProps) => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <PwaServiceWorkerRegistrar />
        <AuthProvider>{children}</AuthProvider>
        <Toaster richColors />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { uid, isAnon, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const shouldRedirectHomeToChat = pathname === "/" && uid && isAnon === false;

  useEffect(() => {
    if (!uid) return;

    void queryClient.prefetchQuery(userQueryOptions(uid));
    void queryClient.prefetchQuery(connectionsQueryOptions(uid));
  }, [queryClient, uid]);

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
