import scheduledTaskServerService from "@/lib/services/scheduled-task-server-service";
import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ taskId: string }>;
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const body = await req.json();
    const userId = await verifyFirebaseIdToken(body.authToken);

    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }

    const task = await scheduledTaskServerService.updateTask({
      taskId,
      userId,
      title: body.title,
      instruction: body.instruction,
      cron: body.cron,
      timezone: body.timezone,
      humanText: body.humanText,
      status: body.status,
      modelId: body.modelId,
      baseUrl: getBaseUrl(req),
    });

    return Response.json({ task });
  } catch (error) {
    return scheduledTaskErrorResponse(error);
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const body = await req.json();
    const userId = await verifyFirebaseIdToken(body.authToken);

    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }

    await scheduledTaskServerService.deleteTask(taskId, userId);

    return Response.json({ success: true });
  } catch (error) {
    return scheduledTaskErrorResponse(error);
  }
}

function getBaseUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

function scheduledTaskErrorResponse(error: unknown) {
  console.error("Automation API failed:", error);

  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update automation",
    },
    { status: error instanceof Error && error.message === "Forbidden" ? 403 : 500 },
  );
}
