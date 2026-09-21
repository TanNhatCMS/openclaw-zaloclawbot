import { describe, it, expect, vi } from "vitest";

vi.mock("../util/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  redactToken: (t: string | undefined) => t ? `${t.slice(0, 4)}:***` : "(none)",
}));

import { requestLogin, waitForLogin } from "./login-qr.js";

function mockFetch(response: { ok?: boolean; status?: number; json?: () => Promise<any>; text?: () => Promise<string> }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: response.json ?? (async () => ({})),
    text: response.text ?? (async () => ""),
  });
}

describe("requestLogin", () => {
  it("returns loginUrl and zbsk on success", async () => {
    const fetcher = mockFetch({
      json: async () => ({
        ok: true,
        result: { loginUrl: "https://example.com/qr", zbsk: "session-key-123" },
      }),
    });
    const result = await requestLogin({ fetch: fetcher });
    expect(result.loginUrl).toBe("https://example.com/qr");
    expect(result.zbsk).toBe("session-key-123");
  });

  it("returns error message on HTTP failure", async () => {
    const fetcher = mockFetch({ ok: false, status: 500, text: async () => "server error" });
    const result = await requestLogin({ fetch: fetcher });
    expect(result.message).toContain("500");
  });

  it("returns error message on network failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await requestLogin({ fetch: fetcher });
    expect(result.message).toContain("network down");
  });

  it("returns error when loginUrl missing", async () => {
    const fetcher = mockFetch({
      json: async () => ({ ok: true, result: { zbsk: "key" } }),
    });
    const result = await requestLogin({ fetch: fetcher });
    expect(result.message).toContain("malformed");
  });
});

describe("waitForLogin", () => {
  it("returns connected on successful login", async () => {
    const fetcher = mockFetch({
      json: async () => ({
        ok: true,
        result: { isLogin: true, botToken: "tok-123", botId: 42 },
      }),
    });
    const result = await waitForLogin({
      zbsk: "key",
      timeoutMs: 5000,
      fetch: fetcher,
    });
    expect(result.connected).toBe(true);
    expect(result.botToken).toBe("tok-123");
  });

  it("returns expired on 498", async () => {
    const fetcher = mockFetch({ status: 498 });
    const result = await waitForLogin({
      zbsk: "key",
      timeoutMs: 5000,
      fetch: fetcher,
    });
    expect(result.connected).toBe(false);
    expect(result.message).toContain("498");
  });

  it("returns aborted when signal aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const fetcher = mockFetch({
      json: async () => ({ ok: true, result: {} }),
    });
    const result = await waitForLogin({
      zbsk: "key",
      timeoutMs: 5000,
      abortSignal: ac.signal,
      fetch: fetcher,
    });
    expect(result.connected).toBe(false);
    expect(result.message).toContain("aborted");
  });

  it("returns timeout after deadline", async () => {
    const fetcher = mockFetch({
      json: async () => ({ ok: true, result: {} }),
    });
    const result = await waitForLogin({
      zbsk: "key",
      timeoutMs: 100, // very short
      fetch: fetcher,
    });
    expect(result.connected).toBe(false);
    expect(result.message).toContain("timeout");
  }, 10000);
});
