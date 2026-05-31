import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/clients/firebase";
import {
  normalizeMcpHeaders,
  type StoredMcpServer,
} from "@/lib/types/mcp-server";

const getMcpServersCollection = (uid: string) =>
  collection(db, "users", uid, "mcpServers");

const getMcpServerDoc = (uid: string, serverId: string) =>
  doc(db, "users", uid, "mcpServers", serverId);

const normalizeDate = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as Timestamp).toDate === "function"
  ) {
    return (value as Timestamp).toDate().toISOString();
  }

  return undefined;
};

const normalizeMcpServer = (
  id: string,
  value: Record<string, unknown>,
): StoredMcpServer | undefined => {
  const url = typeof value.url === "string" ? value.url : undefined;

  if (!url) {
    return undefined;
  }

  return {
    id,
    name: typeof value.name === "string" ? value.name : id,
    url,
    transport: value.transport === "sse" ? "sse" : "http",
    headers: normalizeMcpHeaders(value.headers),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    createdAt: normalizeDate(value.createdAt),
    updatedAt: normalizeDate(value.updatedAt),
  };
};

const removeUndefinedValues = <T>(value: T): T => {
  if (value === undefined) {
    return undefined as T;
  }

  if (value === null || value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => removeUndefinedValues(item)) as T;
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefinedValues(item)]),
    ) as T;
  }

  return value;
};

class McpServerService {
  async getServers(uid: string): Promise<StoredMcpServer[]> {
    const snapshot = await getDocs(getMcpServersCollection(uid));

    return snapshot.docs
      .map((item) =>
        normalizeMcpServer(item.id, item.data() as Record<string, unknown>),
      )
      .filter((server): server is StoredMcpServer => Boolean(server))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveServer(uid: string, server: StoredMcpServer) {
    const now = new Date().toISOString();
    const docRef = getMcpServerDoc(uid, server.id);

    await setDoc(
      docRef,
      removeUndefinedValues({
        ...server,
        createdAt: server.createdAt ?? now,
        updatedAt: now,
      }),
      { merge: true },
    );
  }

  async updateServer(
    uid: string,
    serverId: string,
    update: Partial<StoredMcpServer>,
  ) {
    await updateDoc(
      getMcpServerDoc(uid, serverId),
      removeUndefinedValues({
        ...update,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  async deleteServer(uid: string, serverId: string) {
    await deleteDoc(getMcpServerDoc(uid, serverId));
  }
}

const mcpServerService = new McpServerService();
export default mcpServerService;
