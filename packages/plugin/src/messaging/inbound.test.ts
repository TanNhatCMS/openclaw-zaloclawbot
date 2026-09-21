import { describe, it, expect } from "vitest";
import { zaloUpdateToMsgContext } from "./inbound.js";
import type { ZaloUpdate } from "../api/api.js";

function makeUpdate(overrides?: Partial<ZaloUpdate["message"]>): ZaloUpdate {
  return {
    event_name: "message",
    message: {
      text: "Hello!",
      chat: { id: "user-123", chat_type: "PRIVATE" },
      from: { id: "sender-456", display_name: "Test User" },
      date: 1700000000,
      ...overrides,
    },
  };
}

describe("zaloUpdateToMsgContext", () => {
  it("converts valid private chat update to context", () => {
    const result = zaloUpdateToMsgContext(makeUpdate(), "acct-1");
    expect(result).not.toBeNull();
    expect(result!.Body).toBe("Hello!");
    expect(result!.From).toBe("sender-456");
    expect(result!.To).toBe("user-123");
    expect(result!.AccountId).toBe("acct-1");
    expect(result!.ChatType).toBe("direct");
    expect(result!.Provider).toBe("openclaw-zaloclawbot");
  });

  it("returns null when message is missing", () => {
    expect(zaloUpdateToMsgContext({ event_name: "callback" }, "acct-1")).toBeNull();
  });

  it("returns null for non-PRIVATE chat", () => {
    const update = makeUpdate({ chat: { id: "group-1", chat_type: "GROUP" } });
    expect(zaloUpdateToMsgContext(update, "acct-1")).toBeNull();
  });

  it("returns null for empty text", () => {
    const update = makeUpdate({ text: "   " });
    expect(zaloUpdateToMsgContext(update, "acct-1")).toBeNull();
  });

  it("trims text in Body", () => {
    const update = makeUpdate({ text: "  spaced  " });
    const result = zaloUpdateToMsgContext(update, "acct-1");
    expect(result!.Body).toBe("spaced");
  });

  it("includes timestamp when present", () => {
    const result = zaloUpdateToMsgContext(makeUpdate({ date: 1700000000 }), "acct-1");
    expect(result!.Timestamp).toBe(1700000000);
  });

  it("sets SenderName from display_name", () => {
    const result = zaloUpdateToMsgContext(makeUpdate(), "acct-1");
    expect(result!.SenderName).toBe("Test User");
  });

  it("generates unique MessageSid", () => {
    const a = zaloUpdateToMsgContext(makeUpdate(), "acct-1");
    const b = zaloUpdateToMsgContext(makeUpdate(), "acct-1");
    expect(a!.MessageSid).not.toBe(b!.MessageSid);
  });
});
