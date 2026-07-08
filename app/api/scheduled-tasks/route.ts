import scheduledTaskServerService from "@/lib/services/scheduled-task-server-service";
import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const userId = await verifyFirebaseIdToken(
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
    );

    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }

    const tasks = await scheduledTaskServerService.listTasksForUser(userId);

    return Response.json(
      { tasks },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    return scheduledTaskErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId = await verifyFirebaseIdToken(body.authToken);

    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }

    const task = await scheduledTaskServerService.createTask({
      userId,
      title: body.title,
      instruction: body.instruction,
      cron: body.cron,
      timezone: body.timezone,
      humanText: body.humanText,
      source: "manual",
      modelId: body.modelId,
      baseUrl: getBaseUrl(req),
    });

    return Response.json({ task });
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
