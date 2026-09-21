import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveStateDir, resolveClawbotStateDir } from "./state-dir.js";

describe("resolveStateDir", () => {
  const orig = process.env.OPENCLAW_STATE_DIR;

  afterEach(() => {
    if (orig === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = orig;
  });

  it("uses env var when set", () => {
    process.env.OPENCLAW_STATE_DIR = "/tmp/test-state";
    expect(resolveStateDir()).toBe("/tmp/test-state");
  });

  it("falls back to ~/.openclaw when env var is empty", () => {
    process.env.OPENCLAW_STATE_DIR = "";
    const result = resolveStateDir();
    expect(result).toContain(".openclaw");
  });

  it("trims whitespace from env var", () => {
    process.env.OPENCLAW_STATE_DIR = "  /tmp/spaces  ";
    expect(resolveStateDir()).toBe("/tmp/spaces");
  });
});

describe("resolveClawbotStateDir", () => {
  it("appends openclaw-zaloclawbot to state dir", () => {
    process.env.OPENCLAW_STATE_DIR = "/tmp/test-state";
    const result = resolveClawbotStateDir();
    expect(result).toContain("openclaw-zaloclawbot");
    expect(result).toContain("test-state");
  });
});
