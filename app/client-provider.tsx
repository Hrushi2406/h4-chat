"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/clients/query-client";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import AuthDialog from "@/components/auth/auth-dialog";
import { TextShimmer } from "@/components/ui/text-shimmer";

interface ClientProviderProps {
  children: React.ReactNode;
}

export const ClientProvider = ({ children }: ClientProviderProps) => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      <Toaster richColors />
    </QueryClientProvider>
  );
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { uid } = useAuth();

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
