import { describe, it, expect, vi } from "vitest";
import {
  ZaloApiError,
  callZaloApi,
  getUpdates,
  sendMessage,
  sendVoice,
  setWebhook,
  testWebhook,
  validateWebhookParams,
} from "./api.js";

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

describe("sendMessage", () => {
  const okFetch = () =>
    vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { message_id: "82599fa32f56d00e8941", date: 1 } }),
    });

  it("sends parse_mode and text_styles", async () => {
    const mockFetch = okFetch();
    await sendMessage(
      "token",
      {
        chat_id: "abc.xyz",
        text: "Xin chào bạn",
        text_styles: [{ start: 0, len: 7, st: ["b", "c_db342e"] }],
      },
      mockFetch as any,
    );
    const [, opts] = mockFetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({
      chat_id: "abc.xyz",
      text: "Xin chào bạn",
      text_styles: [{ start: 0, len: 7, st: ["b", "c_db342e"] }],
    });
  });

  it("rejects empty text (docs: 1–2000 chars)", async () => {
    await expect(
      sendMessage("token", { chat_id: "a", text: "" }, okFetch() as any),
    ).rejects.toThrow("1–2000");
  });

  it("rejects text over 2000 chars", async () => {
    await expect(
      sendMessage("token", { chat_id: "a", text: "x".repeat(2001) }, okFetch() as any),
    ).rejects.toThrow("1–2000");
  });
});

describe("sendVoice", () => {
  const okFetch = () =>
    vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { message_id: "82599fa32f56d00e8941", date: 1 } }),
    });

  it("posts chat_id and voice_url", async () => {
    const mockFetch = okFetch();
    const result = await sendVoice(
      "token",
      { chat_id: "abc.xyz", voice_url: "https://example.com/voice.aac" },
      mockFetch as any,
    );
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/bottoken/sendVoice");
    expect(JSON.parse(opts.body)).toEqual({
      chat_id: "abc.xyz",
      voice_url: "https://example.com/voice.aac",
    });
    expect(result.result?.message_id).toBe("82599fa32f56d00e8941");
  });

  it("rejects non-.aac voice_url", async () => {
    await expect(
      sendVoice(
        "token",
        { chat_id: "a", voice_url: "https://example.com/voice.mp3" },
        okFetch() as any,
      ),
    ).rejects.toThrow(".aac");
  });

  it("rejects missing chat_id", async () => {
    await expect(
      sendVoice("token", { chat_id: "  ", voice_url: "https://example.com/v.aac" }, okFetch() as any),
    ).rejects.toThrow("chat_id is required");
  });
});

describe("validateWebhookParams / setWebhook", () => {
  const good = { url: "https://example.com/openclaw-zaloclawbot/acct-1", secret_token: "s3cret-token-long-enough" };

  it("accepts a public HTTPS url with a valid secret", () => {
    expect(() => validateWebhookParams(good)).not.toThrow();
  });

  it("rejects http urls", () => {
    expect(() => validateWebhookParams({ ...good, url: "http://example.com/hook" })).toThrow("HTTPS");
  });

  it("rejects localhost and private IPs", () => {
    for (const url of [
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://192.168.1.10/hook",
      "https://10.0.0.5/hook",
      "https://172.17.0.1/hook",
    ]) {
      expect(() => validateWebhookParams({ ...good, url })).toThrow("publicly reachable");
    }
  });

  it("rejects secrets shorter than 8 chars", () => {
    expect(() => validateWebhookParams({ ...good, secret_token: "short" })).toThrow("8–256");
  });

  it("setWebhook posts url + secret_token and returns verification", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        result: {
          url: good.url,
          updated_at: 1749538250568,
          verification: { ok: true, url: good.url, outcome: "webhook.ok", hint: "ok" },
        },
      }),
    });
    const result = await setWebhook("token", good, mockFetch as any);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/bottoken/setWebhook");
    expect(JSON.parse(opts.body)).toEqual(good);
    expect(result.result?.verification?.outcome).toBe("webhook.ok");
  });
});

describe("testWebhook", () => {
  it("posts with no body and returns the verification result", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        result: { ok: false, url: "https://example.com/hook", outcome: "webhook.http.403", hint: "WAF" },
      }),
    });
    const result = await testWebhook("token", mockFetch as any);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/bottoken/testWebhook");
    expect(opts.body).toBeUndefined();
    expect(result.result?.outcome).toBe("webhook.http.403");
  });
});
