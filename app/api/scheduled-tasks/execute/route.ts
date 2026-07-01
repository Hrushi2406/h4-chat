import { getQstashReceiver } from "@/lib/clients/qstash";
import scheduledTaskServerService from "@/lib/services/scheduled-task-server-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const bodyText = await req.text();

  try {
    const receiver = getQstashReceiver();

    if (!receiver) {
      return Response.json(
        { error: "QStash signature verification is not configured" },
        { status: 503 },
      );
    }

    await receiver.verify({
      signature: req.headers.get("upstash-signature") ?? "",
      body: bodyText,
      url: req.url,
      clockTolerance: 60,
    });

    const body = JSON.parse(bodyText) as { taskId?: string };

    if (!body.taskId) {
      return Response.json({ error: "Missing taskId" }, { status: 400 });
    }

    const run = await scheduledTaskServerService.runTask({
      taskId: body.taskId,
      trigger: "schedule",
      baseUrl: getBaseUrl(req),
    });

    return Response.json({ run });
  } catch (error) {
    console.error("Automation execution failed:", error);

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Automation execution failed",
      },
      { status: 500 },
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
