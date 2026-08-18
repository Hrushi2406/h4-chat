import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runTask: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/lib/clients/qstash", () => ({
  getQstashReceiver: () => ({ verify: mocks.verify }),
}));

vi.mock("@/lib/services/scheduled-task-server-service", () => ({
  default: { runTask: mocks.runTask },
  InactiveScheduledTaskError: class InactiveScheduledTaskError extends Error {
    constructor(
      readonly taskId: string,
      readonly taskStatus: string,
    ) {
      super("Automation is not active");
    }
  },
}));

import { POST } from "@/app/api/scheduled-tasks/execute/route";

const originalNextPublicBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
const originalAppUrl = process.env.APP_URL;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = "https://tunnel.reelads.pro/";
  delete process.env.APP_URL;
  mocks.verify.mockResolvedValue(true);
  mocks.runTask.mockResolvedValue({ id: "run_test" });
});

afterEach(() => {
  if (originalNextPublicBaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_BASE_URL = originalNextPublicBaseUrl;
  }

  if (originalAppUrl === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalAppUrl;
  }
});

describe("scheduled task execution route", () => {
  it("verifies QStash signatures against the public URL behind a tunnel", async () => {
    const body = JSON.stringify({ taskId: "task_test" });
    const response = await POST(
      new Request("https://localhost:3000/api/scheduled-tasks/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "upstash-message-id": "message_test",
          "upstash-signature": "signature_test",
        },
        body,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith({
      signature: "signature_test",
      body,
      url: "https://tunnel.reelads.pro/api/scheduled-tasks/execute",
      clockTolerance: 60,
    });
    expect(mocks.runTask).toHaveBeenCalledWith({
      taskId: "task_test",
      trigger: "schedule",
      baseUrl: "https://tunnel.reelads.pro",
      deliveryId: "message_test",
    });
  });
});
