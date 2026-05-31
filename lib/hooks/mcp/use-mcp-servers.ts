import { useQuery } from "@tanstack/react-query";
import mcpServerService from "@/lib/services/mcp-server-service";

export const mcpServerKeys = {
  all: ["mcpServers"] as const,
  list: (uid: string) => [...mcpServerKeys.all, uid] as const,
};

export const mcpServersQueryOptions = (uid: string) => ({
  queryKey: mcpServerKeys.list(uid),
  queryFn: () => mcpServerService.getServers(uid),
  staleTime: 60 * 1000,
});

export const useMcpServers = (uid?: string) =>
  useQuery({
    ...mcpServersQueryOptions(uid ?? ""),
    enabled: Boolean(uid),
  });
