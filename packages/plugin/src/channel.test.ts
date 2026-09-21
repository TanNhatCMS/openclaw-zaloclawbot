import { describe, it, expect } from "vitest";
import { clampClawbotChunkLimit } from "./channel.js";

describe("clampClawbotChunkLimit", () => {
  it("returns default for undefined", () => {
    expect(clampClawbotChunkLimit(undefined)).toBe(1990);
  });

  it("returns default for zero", () => {
    expect(clampClawbotChunkLimit(0)).toBe(1990);
  });

  it("returns default for negative", () => {
    expect(clampClawbotChunkLimit(-100)).toBe(1990);
  });

  it("clamps to hard limit of 2000", () => {
    expect(clampClawbotChunkLimit(5000)).toBe(2000);
  });

  it("returns value when within range", () => {
    expect(clampClawbotChunkLimit(1500)).toBe(1500);
  });

  it("returns exact hard limit", () => {
    expect(clampClawbotChunkLimit(2000)).toBe(2000);
  });
});
