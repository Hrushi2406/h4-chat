const APP_NAME = "Sakhi AI";
const DEFAULT_SHARED_TITLE = `Shared thread | ${APP_NAME}`;
const DEFAULT_SHARED_DESCRIPTION = `Someone shared a thread with you on ${APP_NAME}.`;

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
  nullValue?: null;
};

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

type FirestoreRunQueryResponse = Array<{
  document?: FirestoreDocument;
}>;

type SharedChatPreview = {
  title: string;
  description: string;
};

const getStringField = (
  fields: FirestoreDocument["fields"],
  key: string
): string | undefined => {
  const value = fields?.[key]?.stringValue?.trim();
  return value || undefined;
};

const getFirestoreRestBaseUrl = () => {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    return undefined;
  }

  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
};

const getSharedThreadDocument = async (shareId: string) => {
  const baseUrl = getFirestoreRestBaseUrl();

  if (!baseUrl) {
    return undefined;
  }

  const response = await fetch(`${baseUrl}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "threads" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "shareId" },
            op: "EQUAL",
            value: { stringValue: shareId },
          },
        },
        limit: 1,
      },
    }),
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    console.error("Failed to fetch shared thread metadata:", response.status);
    return undefined;
  }

  const data = (await response.json()) as FirestoreRunQueryResponse;
  return data.find((item) => item.document)?.document;
};

const getUserDocument = async (userId?: string) => {
  const baseUrl = getFirestoreRestBaseUrl();

  if (!baseUrl || !userId) {
    return undefined;
  }

  const response = await fetch(`${baseUrl}/users/${encodeURIComponent(userId)}`, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    console.error("Failed to fetch shared thread owner metadata:", response.status);
    return undefined;
  }

  return (await response.json()) as FirestoreDocument;
};

const buildSharedChatPreview = (
  ownerName?: string,
  chatTitle?: string
): SharedChatPreview => {
  const sharedBy = ownerName ?? "Someone";
  const resolvedChatTitle = chatTitle ?? "a thread";
  const title = `${sharedBy} shared ${resolvedChatTitle} with you`;
  const description = `Catch up on the ${APP_NAME} thread ${sharedBy} sent you.`;

  return {
    title,
    description,
  };
};

export const getDefaultSharedChatPreview = (): SharedChatPreview => ({
  title: DEFAULT_SHARED_TITLE,
  description: DEFAULT_SHARED_DESCRIPTION,
});

export const getSharedChatPreview = async (
  shareId: string
): Promise<SharedChatPreview> => {
  try {
    const threadDocument = await getSharedThreadDocument(shareId);
    const threadFields = threadDocument?.fields;

    if (!threadFields) {
      return getDefaultSharedChatPreview();
    }

    const userId = getStringField(threadFields, "userId");
    const chatTitle = getStringField(threadFields, "title");
    const userDocument = await getUserDocument(userId);
    const ownerName =
      getStringField(userDocument?.fields, "name") ??
      getStringField(userDocument?.fields, "email");

    return buildSharedChatPreview(ownerName, chatTitle);
  } catch (error) {
    console.error("Failed to build shared thread metadata:", error);
    return getDefaultSharedChatPreview();
  }
};
