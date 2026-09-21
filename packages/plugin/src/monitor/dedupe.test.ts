import { describe, it, expect } from "vitest";
import { MessageIdDedupe } from "./dedupe.js";

describe("MessageIdDedupe", () => {
  it("returns false for new ids and true for duplicates", () => {
    const dedupe = new MessageIdDedupe();
    expect(dedupe.seen("abc")).toBe(false);
    expect(dedupe.seen("abc")).toBe(true);
    expect(dedupe.seen("def")).toBe(false);
  });

  it("treats undefined/null/empty as not-seen", () => {
    const dedupe = new MessageIdDedupe();
    expect(dedupe.seen(undefined)).toBe(false);
  });

  it("supports numeric ids", () => {
    const dedupe = new MessageIdDedupe();
    expect(dedupe.seen(42)).toBe(false);
    expect(dedupe.seen(42)).toBe(true);
    expect(dedupe.seen(43)).toBe(false);
  });

  it("evicts oldest entries when maxSize exceeded", () => {
    const dedupe = new MessageIdDedupe(3);
    dedupe.seen("a");
    dedupe.seen("b");
    dedupe.seen("c");
    expect(dedupe.size).toBe(3);

    // adding "d" evicts "a" — check remaining before re-adding "a"
    dedupe.seen("d");
    expect(dedupe.size).toBe(3);
    expect(dedupe.seen("b")).toBe(true);  // still present
    expect(dedupe.seen("c")).toBe(true);  // still present
    expect(dedupe.seen("d")).toBe(true);  // most recent
    expect(dedupe.seen("a")).toBe(false); // evicted (checking last re-adds it)
  });

  it("clear resets state", () => {
    const dedupe = new MessageIdDedupe();
    dedupe.seen("x");
    dedupe.clear();
    expect(dedupe.size).toBe(0);
    expect(dedupe.seen("x")).toBe(false);
  });

  it("throws on non-positive maxSize", () => {
    expect(() => new MessageIdDedupe(0)).toThrow("maxSize must be > 0");
    expect(() => new MessageIdDedupe(-1)).toThrow("maxSize must be > 0");
  });
});
