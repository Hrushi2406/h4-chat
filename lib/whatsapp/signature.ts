import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

export const verifyMetaSignature = (
  rawBody: string,
  signature: string | null,
  appSecret: string,
): boolean => {
  if (!signature?.startsWith(SIGNATURE_PREFIX) || !appSecret) return false;

  const supplied = signature.slice(SIGNATURE_PREFIX.length);
  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  if (supplied.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
};
