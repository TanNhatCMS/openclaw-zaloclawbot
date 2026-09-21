import { describe, it, expect, vi } from "vitest";
import { ZaloApiError, callZaloApi, getUpdates } from "./api.js";

describe("ZaloApiError", () => {
  it("has correct name and properties", () => {
    const err = new ZaloApiError("test error", 400, "bad request");
    expect(err.name).toBe("ZaloApiError");
    expect(err.message).toBe("test error");
    expect(err.errorCode).toBe(400);
    expect(err.description).toBe("bad request");
  });

  it("isPollingTimeout returns true for 408", () => {
    expect(new ZaloApiError("timeout", 408).isPollingTimeout).toBe(true);
    expect(new ZaloApiError("other", 400).isPollingTimeout).toBe(false);
  });
});

describe("callZaloApi", () => {
  it("sends correct request and returns parsed result", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { id: 123 } }),
    });

    const result = await callZaloApi("getMe", "test-token", undefined, { fetch: mockFetch });
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({ id: 123 });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/bottest-token/getMe");
    expect(opts.method).toBe("POST");
  });

  it("throws ZaloApiError on ok=false", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: false, error_code: 401, description: "unauthorized" }),
    });

    await expect(callZaloApi("getMe", "bad-token", undefined, { fetch: mockFetch })).rejects.toThrow(
      ZaloApiError,
    );
  });

  it("sends body when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: {} }),
    });

    await callZaloApi("sendMessage", "token", { text: "hi" }, { fetch: mockFetch });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.body).toBe(JSON.stringify({ text: "hi" }));
  });
});

describe("getUpdates", () => {
  it("throws polling timeout on empty response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      text: async () => "",
    });

    await expect(getUpdates("token", { timeout: 1 }, mockFetch)).rejects.toThrow("empty long-poll");
  });

  it("throws polling timeout on HTML response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      text: async () => "<html>timeout</html>",
    });

    await expect(getUpdates("token", { timeout: 1 }, mockFetch)).rejects.toThrow("HTML long-poll");
  });

  it("returns parsed update on success", async () => {
    const update = { event_name: "message", message: { text: "hello" } };
    const mockFetch = vi.fn().mockResolvedValue({
      text: async () => JSON.stringify({ ok: true, result: update }),
    });

    const result = await getUpdates("token", { timeout: 1 }, mockFetch);
    expect(result.ok).toBe(true);
    expect(result.result).toEqual(update);
  });
});
