import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("openclaw/plugin-sdk/security-runtime", () => ({
  safeEqualSecret: (a: string, b: string) => a === b,
}));

// Minimal in-test stand-ins for the core webhook SDK: the real
// registerWebhookTargetWithPluginRoute installs a gateway HTTP route, which
// has no meaning in a unit test, so emulate the target registry + pipeline
// contract (resolve by path, POST-only, auth by secret header).
vi.mock("openclaw/plugin-sdk/webhook-ingress", () => ({
  registerWebhookTargetWithPluginRoute: (params: any) => {
    const list = params.targetsByPath.get(params.target.path) ?? [];
    params.targetsByPath.set(params.target.path, [...list, params.target]);
    let active = true;
    return {
      target: params.target,
      unregister: () => {
        if (!active) return;
        active = false;
        const cur = (params.targetsByPath.get(params.target.path) ?? []).filter(
          (t: any) => t !== params.target,
        );
        if (cur.length) params.targetsByPath.set(params.target.path, cur);
        else params.targetsByPath.delete(params.target.path);
      },
    };
  },
  resolveWebhookPath: (params: any) => {
    if (params.webhookUrl) {
      try {
        return new URL(params.webhookUrl).pathname;
      } catch {
        return null;
      }
    }
    return params.defaultPath ?? null;
  },
  resolveWebhookTargetWithAuthOrRejectSync: (params: any) => {
    const found = params.targets.find((t: any) => params.isMatch(t));
    if (!found) {
      params.res.statusCode = 401;
      params.res.end("Unauthorized");
      return null;
    }
    return found;
  },
  withResolvedWebhookRequestPipeline: async (params: any) => {
    if (params.allowMethods && !params.allowMethods.includes(params.req.method ?? "")) {
      params.res.statusCode = 405;
      params.res.end("Method Not Allowed");
      return true;
    }
    const path = new URL(params.req.url ?? "/", "http://localhost").pathname;
    const targets = params.targetsByPath.get(path);
    if (!targets?.length) return false;
    await params.handle({ path, targets });
    return true;
  },
}));

vi.mock("openclaw/plugin-sdk/webhook-request-guards", () => ({
  runDetachedWebhookWork: (run: () => Promise<unknown>) => run(),
}));

vi.mock("../util/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), withAccount: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) },
}));

import {
  registerClawbotWebhookTarget,
  lookupClawbotWebhookTarget,
  handleClawbotWebhookRequest,
  handleClawbotWebhookHttpRequest,
  resolveClawbotWebhookUrl,
} from "./webhook.js";
import { IncomingMessage, ServerResponse } from "node:http";

function mockReq(method: string, headers: Record<string, string | string[]>, body?: string, url = "/test"): IncomingMessage {
  const req = Object.assign(new (require("node:events").EventEmitter)(), {
    method,
    headers,
    url,
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
  vi.clearAllMocks();
});

describe("resolveClawbotWebhookUrl", () => {
  it("builds the public URL and route path from the base URL", () => {
    const { url, path } = resolveClawbotWebhookUrl("https://example.com/", "acct-1");
    expect(url).toBe("https://example.com/openclaw-zaloclawbot/acct-1");
    expect(path).toBe("/openclaw-zaloclawbot/acct-1");
  });

  it("keeps a base path prefix", () => {
    const { url, path } = resolveClawbotWebhookUrl("https://example.com/zalo", "acct-1");
    expect(url).toBe("https://example.com/zalo/openclaw-zaloclawbot/acct-1");
    expect(path).toBe("/zalo/openclaw-zaloclawbot/acct-1");
  });
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

  beforeEach(() => {
    target.processUpdate.mockClear();
  });

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

  it("acks 200 and drops a well-formed body without event_name (verification probe)", async () => {
    const req = mockReq("POST", { "x-bot-api-secret-token": "s3cret" }, '{"message":{}}');
    const res = mockRes();
    await handleClawbotWebhookRequest(req as any, res as any, target);
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(target.processUpdate).not.toHaveBeenCalled();
  });

  it("returns 200 and calls processUpdate for valid update", async () => {
    const update = { event_name: "message", message: { message_id: 1, text: "hi" } };
    const req = mockReq("POST", { "x-bot-api-secret-token": "s3cret" }, JSON.stringify(update));
    const res = mockRes();
    await handleClawbotWebhookRequest(req as any, res as any, target);
    expect(res.statusCode).toBe(200);
    // processUpdate is called async, give it a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(target.processUpdate).toHaveBeenCalledWith(update);
  });

  it("drops a duplicate message_id", async () => {
    const update = { event_name: "message", message: { message_id: "dup-1", text: "hi" } };
    for (let i = 0; i < 2; i++) {
      const req = mockReq("POST", { "x-bot-api-secret-token": "s3cret" }, JSON.stringify(update));
      const res = mockRes();
      await handleClawbotWebhookRequest(req as any, res as any, target);
      expect(res.statusCode).toBe(200);
    }
    await new Promise((r) => setTimeout(r, 10));
    expect(target.processUpdate).toHaveBeenCalledTimes(1);
  });

  it("unwraps {ok, result} envelope", async () => {
    const update = { event_name: "callback", message: { message_id: 2 } };
    const req = mockReq("POST", { "x-bot-api-secret-token": "s3cret" }, JSON.stringify({ ok: true, result: update }));
    const res = mockRes();
    await handleClawbotWebhookRequest(req as any, res as any, target);
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(target.processUpdate).toHaveBeenCalledWith(update);
  });
});

describe("handleClawbotWebhookHttpRequest", () => {
  it("dispatches to the target whose secret matches", async () => {
    const processUpdate = vi.fn().mockResolvedValue(undefined);
    const unregister = registerClawbotWebhookTarget({
      path: "/openclaw-zaloclawbot/acct-1",
      accountId: "acct-1",
      secret: "s3cret",
      processUpdate,
    });
    try {
      const update = { event_name: "message.text.received", message: { message_id: "m1", text: "hi" } };
      const req = mockReq(
        "POST",
        { "x-bot-api-secret-token": "s3cret" },
        JSON.stringify(update),
        "/openclaw-zaloclawbot/acct-1",
      );
      const res = mockRes();
      const handled = await handleClawbotWebhookHttpRequest(req as any, res as any);
      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      await new Promise((r) => setTimeout(r, 10));
      expect(processUpdate).toHaveBeenCalledWith(update);
    } finally {
      unregister();
    }
  });

  it("returns 401 when no target secret matches", async () => {
    const unregister = registerClawbotWebhookTarget({
      path: "/openclaw-zaloclawbot/acct-1",
      accountId: "acct-1",
      secret: "s3cret",
      processUpdate: vi.fn().mockResolvedValue(undefined),
    });
    try {
      const req = mockReq(
        "POST",
        { "x-bot-api-secret-token": "wrong" },
        JSON.stringify({ event_name: "message.text.received", message: { message_id: "m1" } }),
        "/openclaw-zaloclawbot/acct-1",
      );
      const res = mockRes();
      await handleClawbotWebhookHttpRequest(req as any, res as any);
      expect(res.statusCode).toBe(401);
    } finally {
      unregister();
    }
  });

  it("returns false when the path has no live targets", async () => {
    const req = mockReq("POST", {}, "{}", "/openclaw-zaloclawbot/nope");
    const res = mockRes();
    const handled = await handleClawbotWebhookHttpRequest(req as any, res as any);
    expect(handled).toBe(false);
  });
});
