import type { McpServerInput } from "@/lib/mcp";
import { normalizeMcpHeaders } from "@/lib/types/mcp-server";

type FirestoreValue = {
  stringValue?: string;
  booleanValue?: boolean;
  mapValue?: {
    fields?: Record<string, FirestoreValue>;
  };
};

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

type FirestoreListResponse = {
  documents?: FirestoreDocument[];
  error?: {
    message?: string;
  };
};

const getStringField = (
  fields: Record<string, FirestoreValue>,
  key: string,
) => fields[key]?.stringValue;

const getBooleanField = (
  fields: Record<string, FirestoreValue>,
  key: string,
) => fields[key]?.booleanValue;

const getMapField = (fields: Record<string, FirestoreValue>, key: string) => {
  const mapFields = fields[key]?.mapValue?.fields;

  if (!mapFields) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(mapFields).flatMap(([headerKey, value]) =>
      typeof value.stringValue === "string"
        ? [[headerKey, value.stringValue]]
        : [],
    ),
  );
};

const getDocumentId = (documentName?: string) => {
  if (!documentName) {
    return undefined;
  }

  return documentName.split("/").at(-1);
};

export const getUserMcpServersFromFirestore = async ({
  idToken,
  userId,
}: {
  idToken?: string;
  userId?: string;
}): Promise<McpServerInput[]> => {
  if (!idToken || !userId) {
    return [];
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    return [];
  }

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(
      userId,
    )}/mcpServers`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    },
  );
  const data = (await response.json()) as FirestoreListResponse;

  if (!response.ok) {
    console.error("Failed to load MCP servers from Firestore:", data.error?.message);
    return [];
  }

  return (data.documents ?? [])
    .map((document): McpServerInput | undefined => {
      const fields = document.fields ?? {};
      const id = getStringField(fields, "id") ?? getDocumentId(document.name);
      const url = getStringField(fields, "url");

      if (!id || !url) {
        return undefined;
      }

      return {
        id,
        name: getStringField(fields, "name"),
        url,
        transport: getStringField(fields, "transport") === "sse" ? "sse" : "http",
        headers: normalizeMcpHeaders(getMapField(fields, "headers")),
        enabled: getBooleanField(fields, "enabled") ?? true,
      };
    })
    .filter((server): server is McpServerInput => Boolean(server))
    .filter((server) => server.enabled !== false);
};
