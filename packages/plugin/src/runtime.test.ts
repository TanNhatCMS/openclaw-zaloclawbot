import { describe, it, expect } from "vitest";
import { setClawbotRuntime, getClawbotRuntime, waitForClawbotRuntime, resolveClawbotChannelRuntime } from "./runtime.js";

describe("setClawbotRuntime / getClawbotRuntime", () => {
  it("set and get work together", () => {
    setClawbotRuntime({ version: "test-1.0" });
    expect(getClawbotRuntime().version).toBe("test-1.0");
  });
});

describe("waitForClawbotRuntime", () => {
  it("resolves immediately if runtime already set", async () => {
    setClawbotRuntime({ version: "ready" });
    const result = await waitForClawbotRuntime(1000);
    expect(result.version).toBe("ready");
  });
});

describe("resolveClawbotChannelRuntime", () => {
  it("returns channelRuntime if provided", async () => {
    const mock = { fake: true };
    const result = await resolveClawbotChannelRuntime({ channelRuntime: mock });
    expect(result).toBe(mock);
  });

  it("returns pluginRuntime.channel if available", async () => {
    setClawbotRuntime({ channel: { fromPlugin: true } });
    const result = await resolveClawbotChannelRuntime({});
    expect(result).toEqual({ fromPlugin: true });
  });
});
