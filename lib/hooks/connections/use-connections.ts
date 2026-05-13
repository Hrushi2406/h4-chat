import { auth } from "@/lib/clients/firebase";
import { useQuery } from "@tanstack/react-query";

export type ConnectionToolkit = {
  slug: string;
  name: string;
  providerName: string;
  logo?: string;
  isConnected: boolean;
  connectedAccountId?: string;
  status?: string;
};

export const connectionKeys = {
  all: ["connections"] as const,
  list: (uid: string) => [...connectionKeys.all, uid] as const,
};

export const fetchConnections = async (): Promise<ConnectionToolkit[]> => {
  const authToken = await auth.currentUser?.getIdToken();
  const response = await fetch("/api/connections", {
    cache: "no-store",
    headers: authToken
      ? {
          Authorization: `Bearer ${authToken}`,
        }
      : undefined,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Unable to load connections");
  }

  return data.toolkits ?? [];
};

export const connectionsQueryOptions = (uid: string) => ({
  queryKey: connectionKeys.list(uid),
  queryFn: fetchConnections,
  retry: false,
  staleTime: 5 * 60 * 1000,
});

export const useConnections = (uid?: string) => {
  return useQuery({
    ...connectionsQueryOptions(uid ?? ""),
    enabled: !!uid,
  });
};
