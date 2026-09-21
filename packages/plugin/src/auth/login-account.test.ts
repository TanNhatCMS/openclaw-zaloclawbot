import { describe, it, expect } from "vitest";
import { parseBotTokenPublicId, resolveLoginAccountIdentity } from "./login-account.js";

describe("parseBotTokenPublicId", () => {
  it("extracts numeric id from valid token format", () => {
    expect(parseBotTokenPublicId("123456:AbCdEfGh")).toBe("123456");
  });

  it("returns undefined for invalid format", () => {
    expect(parseBotTokenPublicId("not-a-token")).toBeUndefined();
    expect(parseBotTokenPublicId("")).toBeUndefined();
    expect(parseBotTokenPublicId("abc:123")).toBeUndefined(); // non-numeric id
  });

  it("trims whitespace", () => {
    expect(parseBotTokenPublicId("  999:xyz  ")).toBe("999");
  });
});

describe("resolveLoginAccountIdentity", () => {
  it("uses accountName when provided", () => {
    const result = resolveLoginAccountIdentity({
      botToken: "123:abc",
      accountName: "MyBot",
    });
    expect(result.accountId).toContain("clawbot");
    expect(result.accountName).toBe("MyBot");
    expect(result.usedTokenFallback).toBe(false);
  });

  it("uses botId when accountName not provided", () => {
    const result = resolveLoginAccountIdentity({
      botToken: "123:abc",
      botId: "bot-42",
    });
    expect(result.accountId).toContain("clawbot");
    expect(result.storageBotId).toBe("bot-42");
    expect(result.usedTokenFallback).toBe(false);
  });

  it("falls back to token fingerprint when no name/id", () => {
    const result = resolveLoginAccountIdentity({
      botToken: "123456:AbCdEf",
    });
    expect(result.accountId).toContain("clawbot");
    expect(result.tokenPublicId).toBe("123456");
    expect(result.usedTokenFallback).toBe(true);
  });

  it("handles token without public id", () => {
    const result = resolveLoginAccountIdentity({
      botToken: "just-a-token",
    });
    expect(result.tokenPublicId).toBeUndefined();
    expect(result.usedTokenFallback).toBe(true);
  });
});
