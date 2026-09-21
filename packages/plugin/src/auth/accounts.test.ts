import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listIndexedClawbotAccountIds, registerClawbotAccountId, unregisterClawbotAccountId, saveClawbotAccount, loadClawbotAccount, clearClawbotAccount, resolveClawbotAccount } from "./accounts.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawbot-test-"));
  process.env.OPENCLAW_STATE_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.OPENCLAW_STATE_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("account CRUD", () => {
  it("listIndexedClawbotAccountIds returns empty when no index file", () => {
    expect(listIndexedClawbotAccountIds()).toEqual([]);
  });

  it("registerClawbotAccountId creates and updates index", () => {
    registerClawbotAccountId("acct-1");
    expect(listIndexedClawbotAccountIds()).toContain("acct-1");

    // Idempotent
    registerClawbotAccountId("acct-1");
    expect(listIndexedClawbotAccountIds().filter((id: string) => id === "acct-1")).toHaveLength(1);
  });

  it("unregisterClawbotAccountId removes from index", () => {
    registerClawbotAccountId("acct-1");
    registerClawbotAccountId("acct-2");
    unregisterClawbotAccountId("acct-1");
    expect(listIndexedClawbotAccountIds()).not.toContain("acct-1");
    expect(listIndexedClawbotAccountIds()).toContain("acct-2");
  });

  it("saveClawbotAccount and loadClawbotAccount round-trip", () => {
    saveClawbotAccount("acct-save", {
      botId: "bot-1",
      botToken: "tok-123",
      accountName: "MyBot",
    });
    const loaded = loadClawbotAccount("acct-save");
    expect(loaded).not.toBeNull();
    expect(loaded!.botId).toBe("bot-1");
    expect(loaded!.botToken).toBe("tok-123");
    expect(loaded!.accountName).toBe("MyBot");
    expect(loaded!.savedAt).toBeDefined();
  });

  it("loadClawbotAccount returns null for missing account", () => {
    expect(loadClawbotAccount("nonexistent")).toBeNull();
  });

  it("clearClawbotAccount removes the file", () => {
    saveClawbotAccount("acct-clear", { botId: "b", botToken: "t" });
    clearClawbotAccount("acct-clear");
    expect(loadClawbotAccount("acct-clear")).toBeNull();
  });

  it("resolveClawbotAccount throws when no accountId", () => {
    expect(() => resolveClawbotAccount({} as any, null)).toThrow("accountId is required");
  });

  it("resolveClawbotAccount merges config and stored data", () => {
    saveClawbotAccount("acct-merge", {
      botId: "bot-merge",
      botToken: "tok-merge",
      accountName: "MergeBot",
    });
    const result = resolveClawbotAccount({} as any, "acct-merge");
    expect(result.accountId).toBe("acct-merge");
    expect(result.botToken).toBe("tok-merge");
    expect(result.configured).toBe(true);
  });
});
