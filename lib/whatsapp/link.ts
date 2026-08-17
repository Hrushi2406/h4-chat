import { createHash, randomBytes } from "node:crypto";

export const createWhatsAppLinkToken = () => randomBytes(24).toString("base64url");
export const hashWhatsAppLinkToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const parseWhatsAppLinkCommand = (text: string | undefined) => {
  const match = text?.trim().match(/^\/?connect\s+([A-Za-z0-9_-]{20,64})$/i);
  return match?.[1];
};
