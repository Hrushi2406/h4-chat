import { consumeComposioAuthIntent } from "@/lib/composio-auth-intents";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const intentId = requestUrl.searchParams.get("intentId");
  const intent = intentId
    ? await consumeComposioAuthIntent(intentId).catch((error) => {
        console.error(
          "Failed to consume Composio auth intent:",
          error instanceof Error ? error.message : error,
        );
        return undefined;
      })
    : undefined;

  const redirectUrl = buildRedirectUrl(requestUrl, intent);

  return Response.redirect(redirectUrl);
}

function buildRedirectUrl(
  requestUrl: URL,
  intent:
    | {
        source: "chat" | "apps" | "automations";
        threadId?: string;
      }
    | undefined,
) {
  const redirectUrl = new URL(getRedirectPath(intent), getCallbackBaseUrl(requestUrl));
  const status = requestUrl.searchParams.get("status");
  const connectedAccountId = requestUrl.searchParams.get(
    "connected_account_id",
  );

  redirectUrl.searchParams.set(
    "composioAuth",
    status === "error" ? "error" : "complete",
  );

  if (status) {
    redirectUrl.searchParams.set("status", status);
  }

  if (connectedAccountId) {
    redirectUrl.searchParams.set("connected_account_id", connectedAccountId);
  }

  if (!intent) {
    redirectUrl.searchParams.set("error", "expired_auth_intent");
  }

  return redirectUrl;
}

function getCallbackBaseUrl(requestUrl: URL) {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    requestUrl.origin
  ).replace(/\/$/, "");
}

function getRedirectPath(
  intent:
    | {
        source: "chat" | "apps" | "automations";
        threadId?: string;
      }
    | undefined,
) {
  if (!intent) return "/apps";

  if (intent.source === "chat" && intent.threadId) {
    return `/chat/${encodeURIComponent(intent.threadId)}`;
  }

  if (intent.source === "automations") {
    return "/automations";
  }

  return "/apps";
}
