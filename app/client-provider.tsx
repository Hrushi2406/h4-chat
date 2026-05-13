"use client";

import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/clients/query-client";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import AuthDialog from "@/components/auth/auth-dialog";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { useEffect } from "react";
import { userQueryOptions } from "@/lib/hooks/user/use-user";
import { connectionsQueryOptions } from "@/lib/hooks/connections/use-connections";

interface ClientProviderProps {
  children: React.ReactNode;
}

export const ClientProvider = ({ children }: ClientProviderProps) => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthProvider>{children}</AuthProvider>
        <Toaster richColors />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { uid } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!uid) return;

    void queryClient.prefetchQuery(userQueryOptions(uid));
    void queryClient.prefetchQuery(connectionsQueryOptions(uid));
  }, [queryClient, uid]);

  if (!uid)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <img
          src="/saaki-chat-transparent.png"
          alt="Saaki AI"
          className="h-16 w-16 object-contain animate-bounce"
        />
        <TextShimmer className="text-2xl font-semibold leading-loose  [--base-color:theme(colors.blue.400)] [--base-gradient-color:theme(colors.blue.600)] dark:[--base-color:theme(colors.blue.700)] dark:[--base-gradient-color:theme(colors.blue.400)]">
          Saaki Chat
        </TextShimmer>
      </div>
    );

  console.log("uid: ", uid);
  return <>{children}</>;
};
