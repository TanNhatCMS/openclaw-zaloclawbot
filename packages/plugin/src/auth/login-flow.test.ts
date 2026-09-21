import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/api.js", () => ({
  getMe: vi.fn().mockResolvedValue({ ok: true, result: { id: 42, account_name: "TestBot" } }),
}));

vi.mock("../util/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), withAccount: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) },
}));

vi.mock("./accounts.js", () => ({
  saveClawbotAccount: vi.fn(),
  registerClawbotAccountId: vi.fn(),
}));

vi.mock("./login-account.js", () => ({
  resolveLoginAccountIdentity: vi.fn().mockReturnValue({
    accountId: "clawbot-test",
    storageBotId: "TestBot",
    accountName: "TestBot",
    usedTokenFallback: false,
  }),
}));

vi.mock("./login-qr.js", () => ({
  requestLogin: vi.fn(),
  waitForLogin: vi.fn(),
}));

import { persistClawbotLogin, runClawbotQrLoginLoop } from "./login-flow.js";
import { saveClawbotAccount, registerClawbotAccountId } from "./accounts.js";
import { requestLogin, waitForLogin } from "./login-qr.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("persistClawbotLogin", () => {
  it("saves account on successful login", async () => {
    const result = await persistClawbotLogin({
      connected: true,
      botToken: "tok-123",
      botId: "bot-1",
      message: "Login confirmed.",
    });
    expect(result.accountId).toBe("clawbot-test");
    expect(saveClawbotAccount).toHaveBeenCalled();
    expect(registerClawbotAccountId).toHaveBeenCalled();
  });

  it("throws when not connected", async () => {
    await expect(persistClawbotLogin({
      connected: false,
      message: "Login failed",
    })).rejects.toThrow("Login failed");
  });
});

describe("runClawbotQrLoginLoop", () => {
  it("returns null when requestLogin fails", async () => {
    (requestLogin as any).mockResolvedValue({ message: "connection error" });
    const result = await runClawbotQrLoginLoop({
      ui: {
        renderQr: vi.fn(),
        beginWait: vi.fn().mockReturnValue({ stop: vi.fn() }),
      },
    });
    expect(result).toBeNull();
  });

  it("returns result on successful login", async () => {
    (requestLogin as any).mockResolvedValue({
      zbsk: "session-key",
      loginUrl: "https://example.com/qr",
    });
    (waitForLogin as any).mockResolvedValue({
      connected: true,
      botToken: "tok-123",
      message: "Login confirmed.",
    });

    const result = await runClawbotQrLoginLoop({
      ui: {
        renderQr: vi.fn(),
        beginWait: vi.fn().mockReturnValue({ stop: vi.fn() }),
      },
    });
    expect(result).not.toBeNull();
  });
});
