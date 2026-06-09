import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// undefined = not yet attempted, null = attempted and failed (don't retry init storms)
let cachedApp: App | null | undefined;

const parseServiceAccount = (raw: string) => {
  const json = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");

  return JSON.parse(json) as Record<string, unknown>;
};

const getAdminApp = (): App | null => {
  if (cachedApp !== undefined) {
    return cachedApp;
  }

  const existing = getApps();

  if (existing.length > 0) {
    cachedApp = existing[0];
    return cachedApp;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

  try {
    cachedApp = initializeApp({
      credential: serviceAccount
        ? cert(parseServiceAccount(serviceAccount))
        : applicationDefault(),
      projectId,
    });
  } catch (error) {
    console.error(
      "Failed to initialize Firebase Admin SDK:",
      error instanceof Error ? error.message : error,
    );
    cachedApp = null;
  }

  return cachedApp;
};

export const getAdminAuth = () => {
  const app = getAdminApp();
  return app ? getAuth(app) : undefined;
};

export const getAdminFirestore = () => {
  const app = getAdminApp();
  return app ? getFirestore(app) : undefined;
};
