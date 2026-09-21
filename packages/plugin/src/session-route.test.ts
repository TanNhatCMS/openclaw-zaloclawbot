import { describe, it, expect, vi } from "vitest";

vi.mock("openclaw/plugin-sdk/core", () => ({
  stripChannelTargetPrefix: (raw: string, ...prefixes: string[]) => {
    for (const p of prefixes) {
      const re = new RegExp(`^${p}:`, "i");
      if (re.test(raw)) return raw.replace(re, "");
    }
    return raw;
  },
  stripTargetKindPrefix: (raw: string) => raw,
  buildChannelOutboundSessionRoute: (params: any) => ({
    sessionKey: `${params.channel}:${params.accountId}:${params.peer.id}`,
    mainSessionKey: `${params.channel}:${params.accountId}:${params.peer.id}`,
  }),
}));

import { normalizeClawbotRouteTarget, resolveClawbotOutboundSessionRoute } from "./session-route.js";

describe("normalizeClawbotRouteTarget", () => {
  it("strips openclaw-zaloclawbot prefix", () => {
    expect(normalizeClawbotRouteTarget("openclaw-zaloclawbot:12345")).toBe("12345");
  });

  it("strips zaloclawbot prefix", () => {
    expect(normalizeClawbotRouteTarget("zaloclawbot:12345")).toBe("12345");
  });

  it("strips zclaw prefix", () => {
    expect(normalizeClawbotRouteTarget("zclaw:12345")).toBe("12345");
  });

  it("strips clawbot prefix", () => {
    expect(normalizeClawbotRouteTarget("clawbot:12345")).toBe("12345");
  });

  it("returns undefined for empty result", () => {
    expect(normalizeClawbotRouteTarget("openclaw-zaloclawbot:")).toBeUndefined();
  });

  it("returns raw if no prefix matches", () => {
    expect(normalizeClawbotRouteTarget("12345")).toBe("12345");
  });
});

describe("resolveClawbotOutboundSessionRoute", () => {
  it("returns route for valid target", () => {
    const result = resolveClawbotOutboundSessionRoute({
      target: "openclaw-zaloclawbot:12345",
      cfg: {} as any,
      agentId: "agent-1",
      accountId: "acct-1",
    });
    expect(result).not.toBeNull();
    expect(result!.sessionKey).toContain("12345");
  });

  it("returns null for empty target", () => {
    expect(resolveClawbotOutboundSessionRoute({
      target: "",
      cfg: {} as any,
      agentId: "agent-1",
      accountId: "acct-1",
    })).toBeNull();
  });
});
