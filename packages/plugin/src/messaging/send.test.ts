import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/api.js", () => ({
  sendMessage: vi.fn().mockResolvedValue({ ok: true, result: { message_id: 42 } }),
}));

vi.mock("../util/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), withAccount: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) },
}));

import { sendClawbotText } from "./send.js";
import { sendMessage } from "../api/api.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendClawbotText", () => {
  it("throws when to is missing", async () => {
    await expect(sendClawbotText({ to: "", text: "hi", token: "tok" })).rejects.toThrow("chat_id is required");
  });

  it("throws when token is missing", async () => {
    await expect(sendClawbotText({ to: "123", text: "hi", token: "" })).rejects.toThrow("bot token is required");
  });

  it("truncates text to 2000 chars", async () => {
    const longText = "a".repeat(3000);
    await sendClawbotText({ to: "123", text: longText, token: "tok" });
    const [, params] = (sendMessage as any).mock.calls[0];
    expect(params.text.length).toBe(2000);
  });

  it("returns messageId from response", async () => {
    const result = await sendClawbotText({ to: "123", text: "hi", token: "tok" });
    expect(result.messageId).toBe("42");
  });
});
