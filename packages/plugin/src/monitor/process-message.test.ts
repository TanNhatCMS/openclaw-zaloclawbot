import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("openclaw/plugin-sdk/channel-outbound", () => ({
  createTypingCallbacks: (c: any) => c,
}));

vi.mock("../api/api.js", () => ({
  sendChatAction: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../messaging/inbound.js", () => ({
  zaloUpdateToMsgContext: vi.fn(),
}));

vi.mock("../messaging/send.js", () => ({
  sendClawbotText: vi.fn().mockResolvedValue({ messageId: "msg-1" }),
}));

vi.mock("../util/logger.js", () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    withAccount: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
}));

import { processOneClawbotMessage } from "./process-message.js";
import { zaloUpdateToMsgContext } from "../messaging/inbound.js";
import { sendClawbotText } from "../messaging/send.js";

function makeDeps() {
  return {
    accountId: "acct-1",
    botToken: "tok-123",
    config: {} as any,
    channelRuntime: {
      routing: { resolveAgentRoute: vi.fn().mockReturnValue({ agentId: "agent-1", sessionKey: "sk", mainSessionKey: "msk" }) },
      session: {
        resolveStorePath: vi.fn().mockReturnValue("/tmp/store"),
        recordInboundSession: vi.fn().mockResolvedValue(undefined),
      },
      reply: {
        finalizeInboundContext: vi.fn().mockImplementation((ctx) => ctx),
        resolveHumanDelayConfig: vi.fn().mockReturnValue({}),
        createReplyDispatcherWithTyping: vi.fn().mockReturnValue({
          dispatcher: {},
          replyOptions: {},
          markDispatchIdle: vi.fn(),
        }),
        withReplyDispatcher: vi.fn().mockImplementation((_o: any, fn: any) => fn?.()),
        dispatchReplyFromConfig: vi.fn().mockResolvedValue(undefined),
      },
    },
    setStatus: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processOneClawbotMessage", () => {
  it("routes valid message through channel runtime", async () => {
    (zaloUpdateToMsgContext as any).mockReturnValue({
      Body: "test message",
      From: "sender-1",
      To: "chat-1",
      AccountId: "acct-1",
      MessageSid: "sid-1",
      ChatType: "direct",
    });
    const deps = makeDeps();
    const update = { event_name: "message", message: { text: "hi" } };
    await processOneClawbotMessage(update, deps);
    expect(deps.channelRuntime.routing.resolveAgentRoute).toHaveBeenCalled();
  });

  it("returns early for non-actionable event", async () => {
    (zaloUpdateToMsgContext as any).mockReturnValue(null);
    const deps = makeDeps();
    await processOneClawbotMessage({ event_name: "callback" }, deps);
    expect(deps.channelRuntime.routing.resolveAgentRoute).not.toHaveBeenCalled();
  });
});
