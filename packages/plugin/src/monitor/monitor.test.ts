import { describe, it, expect, vi } from "vitest";

vi.mock("../api/api.js", () => ({
  getUpdates: vi.fn(),
  getWebhookInfo: vi.fn().mockResolvedValue({ ok: true, result: {} }),
  deleteWebhook: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../runtime.js", () => ({
  resolveClawbotChannelRuntime: vi.fn().mockResolvedValue({}),
}));

vi.mock("../util/logger.js", () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    withAccount: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
  redactToken: () => "***",
}));

vi.mock("./process-message.js", () => ({
  processOneClawbotMessage: vi.fn().mockResolvedValue(undefined),
}));

import { startClawbotProvider } from "./monitor.js";
import { getUpdates } from "../api/api.js";

function makeOpts(overrides?: Record<string, any>) {
  const ac = new AbortController();
  return {
    account: {
      accountId: "acct-1",
      botToken: "tok-123",
      botId: "b",
      configured: true,
      enabled: true,
    } as any,
    config: {} as any,
    abortSignal: ac.signal,
    setStatus: vi.fn(),
    _controller: ac,
    ...overrides,
  };
}

describe("startClawbotProvider", () => {
  it("throws when botToken is missing", async () => {
    const opts = makeOpts({
      account: { accountId: "x", configured: false, enabled: true } as any,
    });
    await expect(startClawbotProvider(opts)).rejects.toThrow("missing botToken");
  });

  it("stops on abort signal", async () => {
    const opts = makeOpts();
    opts._controller.abort();
    (getUpdates as any).mockRejectedValue(new Error("aborted"));
    await startClawbotProvider(opts);
  });

  it("calls processOneClawbotMessage for new updates", async () => {
    const opts = makeOpts();
    let callCount = 0;
    (getUpdates as any).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          result: {
            event_name: "message",
            message: { message_id: 100, text: "hi" },
          },
        };
      }
      opts._controller.abort();
      return { ok: true, result: undefined };
    });

    const { processOneClawbotMessage } = await import("./process-message.js");
    await startClawbotProvider(opts);
    expect(processOneClawbotMessage).toHaveBeenCalled();
  });
});
