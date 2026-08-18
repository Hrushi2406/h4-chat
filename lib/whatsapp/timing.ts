import "server-only";

const WHATSAPP_PIPELINE_TIMING_LOG = "[whatsapp-pipeline-timing]";

const logStage = (
  messageId: string,
  stage: string,
  startedAt: Date,
  startedAtMs: number,
  error?: unknown,
) => {
  console.info(WHATSAPP_PIPELINE_TIMING_LOG, {
    event: error === undefined ? "stage.completed" : "stage.failed",
    messageId,
    stage,
    startedAt: startedAt.toISOString(),
    durationMs: Math.round(performance.now() - startedAtMs),
    ...(error === undefined
      ? {}
      : { errorName: error instanceof Error ? error.name : "UnknownError" }),
  });
};

export const measureWhatsAppStage = async <T>(
  messageId: string | undefined,
  stage: string,
  operation: () => Promise<T>,
): Promise<T> => {
  if (!messageId) return operation();

  const startedAt = new Date();
  const startedAtMs = performance.now();
  try {
    const result = await operation();
    logStage(messageId, stage, startedAt, startedAtMs);
    return result;
  } catch (error) {
    logStage(messageId, stage, startedAt, startedAtMs, error);
    throw error;
  }
};

export const measureWhatsAppStageSync = <T>(
  messageId: string | undefined,
  stage: string,
  operation: () => T,
): T => {
  if (!messageId) return operation();

  const startedAt = new Date();
  const startedAtMs = performance.now();
  try {
    const result = operation();
    logStage(messageId, stage, startedAt, startedAtMs);
    return result;
  } catch (error) {
    logStage(messageId, stage, startedAt, startedAtMs, error);
    throw error;
  }
};
