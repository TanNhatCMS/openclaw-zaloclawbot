import { describe, it, expect, vi } from "vitest";

vi.mock("../api/api.js", () => ({
  getUpdates: vi.fn(),
  getWebhookInfo: vi.fn().mockResolvedValue({ ok: true, result: {} }),
  deleteWebhook: vi.fn().mockResolvedValue({ ok: true }),
  setWebhook: vi.fn().mockResolvedValue({
    ok: true,
    result: { verification: { ok: true, outcome: "webhook.ok", hint: "ok" } },
  }),
}));

vi.mock("../webhook/webhook.js", () => ({
  registerClawbotWebhookTarget: vi.fn(() => vi.fn()),
  resolveClawbotWebhookUrl: vi.fn((baseUrl: string, accountId: string) => ({
    url: `${baseUrl.replace(/\/+$/, "")}/openclaw-zaloclawbot/${accountId}`,
    path: `/openclaw-zaloclawbot/${accountId}`,
  })),
}));

vi.mock("../auth/accounts.js", () => ({
  ensureClawbotWebhookSecret: vi.fn(() => "test-webhook-secret"),
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

  it("starts webhook mode when webhookBaseUrl is set (no polling)", async () => {
    const { setWebhook } = await import("../api/api.js");
    const { registerClawbotWebhookTarget } = await import("../webhook/webhook.js");
    const opts = makeOpts({
      account: {
        accountId: "acct-1",
        botToken: "tok-123",
        botId: "b",
        configured: true,
        enabled: true,
        webhookBaseUrl: "https://example.com",
        webhookSecret: "test-webhook-secret",
      } as any,
    });
    // Abort shortly after start so webhook mode exits.
    setTimeout(() => opts._controller.abort(), 10);
    await startClawbotProvider(opts);
    expect(registerClawbotWebhookTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/openclaw-zaloclawbot/acct-1",
        accountId: "acct-1",
        secret: "test-webhook-secret",
      }),
    );
    expect(setWebhook).toHaveBeenCalledWith(
      "tok-123",
      { url: "https://example.com/openclaw-zaloclawbot/acct-1", secret_token: "test-webhook-secret" },
    );
    expect(getUpdates).not.toHaveBeenCalled();
  });

  it("webhook mode delivers updates through processOneClawbotMessage", async () => {
    const { registerClawbotWebhookTarget } = await import("../webhook/webhook.js");
    const opts = makeOpts({
      account: {
        accountId: "acct-1",
        botToken: "tok-123",
        botId: "b",
        configured: true,
        enabled: true,
        webhookBaseUrl: "https://example.com",
        webhookSecret: "test-webhook-secret",
      } as any,
    });
    let captured: any;
    (registerClawbotWebhookTarget as any).mockImplementation((target: any) => {
      captured = target;
      return vi.fn();
    });
    setTimeout(() => opts._controller.abort(), 50);
    const started = startClawbotProvider(opts);
    // Let the provider register the target, then simulate a webhook delivery.
    await new Promise((r) => setTimeout(r, 10));
    expect(captured).toBeDefined();
    await captured.processUpdate({
      event_name: "message.text.received",
      message: { message_id: "w1", text: "hi" },
    });
    await started;
    const { processOneClawbotMessage } = await import("./process-message.js");
    expect(processOneClawbotMessage).toHaveBeenCalled();
  });
});
