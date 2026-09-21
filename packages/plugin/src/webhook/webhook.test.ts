import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("openclaw/plugin-sdk/security-runtime", () => ({
  safeEqualSecret: (a: string, b: string) => a === b,
}));

vi.mock("../util/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), withAccount: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) },
}));

import { registerClawbotWebhookTarget, lookupClawbotWebhookTarget, handleClawbotWebhookRequest } from "./webhook.js";
import { IncomingMessage, ServerResponse } from "node:http";

function mockReq(method: string, headers: Record<string, string | string[]>, body?: string): IncomingMessage {
  const req = Object.assign(new (require("node:events").EventEmitter)(), {
    method,
    headers,
  });
  if (body !== undefined) {
    process.nextTick(() => {
      req.emit("data", Buffer.from(body));
      req.emit("end");
    });
  }
  return req as any;
}

function mockRes(): ServerResponse & { statusCode: number; body: string; headers: Record<string, string> } {
  const res: any = {
    statusCode: 200,
    body: "",
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(data?: string) { this.body = data ?? ""; },
  };
  return res;
}

beforeEach(() => {
  // Clean up any registered targets
  const target = lookupClawbotWebhookTarget("/test");
  if (target) {
    // Can't unregister easily, but lookup will still work
  }
});

describe("registerClawbotWebhookTarget / lookupClawbotWebhookTarget", () => {
  it("registers and looks up a target", () => {
    const target = {
      path: "/test-reg",
      accountId: "acct-1",
      secret: "s3cret",
      processUpdate: vi.fn(),
    };
    const unregister = registerClawbotWebhookTarget(target);
    expect(lookupClawbotWebhookTarget("/test-reg")).toBe(target);
    unregister();
    expect(lookupClawbotWebhookTarget("/test-reg")).toBeUndefined();
  });
});

describe("handleClawbotWebhookRequest", () => {
  const target = {
    path: "/test",
    accountId: "acct-1",
    secret: "s3cret",
    processUpdate: vi.fn().mockResolvedValue(undefined),
  };

  it("returns 405 for non-POST", async () => {
    const req = mockReq("GET", {});
    const res = mockRes();
    await handleClawbotWebhookRequest(req as any, res as any, target);
    expect(res.statusCode).toBe(405);
  });

  it("returns 403 for wrong secret", async () => {
    const req = mockReq("POST", { "x-bot-api-secret-token": "wrong" }, "{}");
    const res = mockRes();
    await handleClawbotWebhookRequest(req as any, res as any, target);
    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for bad JSON", async () => {
    const req = mockReq("POST", { "x-bot-api-secret-token": "s3cret" }, "not-json");
    const res = mockRes();
    await handleClawbotWebhookRequest(req as any, res as any, target);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for missing event_name", async () => {
    const req = mockReq("POST", { "x-bot-api-secret-token": "s3cret" }, '{"message":{}}');
    const res = mockRes();
    await handleClawbotWebhookRequest(req as any, res as any, target);
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 and calls processUpdate for valid update", async () => {
    const update = { event_name: "message", message: { message_id: 1, text: "hi" } };
    const req = mockReq("POST", { "x-bot-api-secret-token": "s3cret" }, JSON.stringify(update));
    const res = mockRes();
    await handleClawbotWebhookRequest(req as any, res as any, target);
    expect(res.statusCode).toBe(200);
    // processUpdate is called async, give it a tick
    await new Promise(r => setTimeout(r, 10));
    expect(target.processUpdate).toHaveBeenCalledWith(update);
  });

  it("unwraps {ok, result} envelope", async () => {
    const update = { event_name: "callback", message: { message_id: 2 } };
    const req = mockReq("POST", { "x-bot-api-secret-token": "s3cret" }, JSON.stringify({ ok: true, result: update }));
    const res = mockRes();
    await handleClawbotWebhookRequest(req as any, res as any, target);
    expect(res.statusCode).toBe(200);
    await new Promise(r => setTimeout(r, 10));
    expect(target.processUpdate).toHaveBeenCalledWith(update);
  });
});
