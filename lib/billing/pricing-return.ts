const DEFAULT_POST_PURCHASE_PATH = "/chat";

export const getPostPurchasePath = (returnTo?: string | null) => {
  if (
    !returnTo ||
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//")
  ) {
    return DEFAULT_POST_PURCHASE_PATH;
  }

  try {
    const url = new URL(returnTo, "https://sakhi.local");
    if (url.origin !== "https://sakhi.local" || url.pathname === "/pricing") {
      return DEFAULT_POST_PURCHASE_PATH;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_POST_PURCHASE_PATH;
  }
};

export const getPricingHref = (
  returnTo: string,
  section?: "recharge",
) => {
  const safeReturnTo = getPostPurchasePath(returnTo);
  return `/pricing?returnTo=${encodeURIComponent(safeReturnTo)}${
    section ? `#${section}` : ""
  }`;
};
