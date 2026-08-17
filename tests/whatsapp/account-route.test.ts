import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  createLinkIntent: vi.fn(),
  getConnectionForUser: vi.fn(),
  disconnectUser: vi.fn(),
}));

vi.mock("@/lib/firebase-auth-server", () => ({
  verifyFirebaseIdToken: mocks.verifyFirebaseIdToken,
}));
vi.mock("@/lib/whatsapp/link", () => ({
  createWhatsAppLinkToken: () => "one-time-link-token-123456789",
  hashWhatsAppLinkToken: () => "hashed-token",
}));
vi.mock("@/lib/whatsapp/store", () => ({
  WhatsAppStore: class {
    createLinkIntent = mocks.createLinkIntent;
    getConnectionForUser = mocks.getConnectionForUser;
    disconnectUser = mocks.disconnectUser;
  },
}));

import { DELETE, GET, POST } from "@/app/api/whatsapp/account/route";

describe("WhatsApp account route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseIdToken.mockResolvedValue("user-1");
    process.env.WHATSAPP_PUBLIC_NUMBER = "91 88888 88888";
  });

  it("creates a ten-minute one-time WhatsApp deep link", async () => {
    const before = Date.now();
    const response = await POST(new Request("http://localhost/api/whatsapp/account", {
      method: "POST",
      body: JSON.stringify({ authToken: "id-token" }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.link).toContain("https://wa.me/918888888888?text=connect%20one-time-link-token-123456789");
    expect(mocks.createLinkIntent).toHaveBeenCalledWith(
      "user-1",
      "hashed-token",
      expect.any(Date),
    );
    const expiresAt = mocks.createLinkIntent.mock.calls[0][2] as Date;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 10 * 60 * 1_000 - 50);
  });

  it("reports connection state and disconnects without deleting the account", async () => {
    mocks.getConnectionForUser.mockResolvedValue({ connected: true, phoneNumber: "•••• 9999" });
    const getResponse = await GET(new Request("http://localhost/api/whatsapp/account", {
      headers: { Authorization: "Bearer id-token" },
    }));
    await expect(getResponse.json()).resolves.toEqual({ connected: true, phoneNumber: "•••• 9999" });

    const deleteResponse = await DELETE(new Request("http://localhost/api/whatsapp/account", {
      method: "DELETE",
      headers: { Authorization: "Bearer id-token" },
    }));
    expect(deleteResponse.status).toBe(200);
    expect(mocks.disconnectUser).toHaveBeenCalledWith("user-1");
  });
});
