import scheduledTaskServerService from "@/lib/services/scheduled-task-server-service";
import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ taskId: string }>;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const body = await req.json();
    const userId = await verifyFirebaseIdToken(body.authToken);

    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }

    const run = await scheduledTaskServerService.runTask({
      taskId,
      userId,
      trigger: "manual",
      baseUrl: getBaseUrl(req),
    });

    return Response.json({ run });
  } catch (error) {
    console.error("Automation run API failed:", error);

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to run automation",
      },
      { status: error instanceof Error && error.message === "Forbidden" ? 403 : 500 },
    );
  }
}

function getBaseUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    new URL(req.url).origin
  ).replace(/\/$/, "");
}
