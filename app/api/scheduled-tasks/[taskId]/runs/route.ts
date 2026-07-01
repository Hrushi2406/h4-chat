import scheduledTaskServerService from "@/lib/services/scheduled-task-server-service";
import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ taskId: string }>;
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const userId = await verifyFirebaseIdToken(
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
    );

    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }

    const runs = await scheduledTaskServerService.listRunsForTask({
      taskId,
      userId,
    });

    return Response.json({ runs });
  } catch (error) {
    console.error("Automation runs API failed:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load automation runs",
      },
      { status: error instanceof Error && error.message === "Forbidden" ? 403 : 500 },
    );
  }
}
