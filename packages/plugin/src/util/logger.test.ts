import { describe, it, expect } from "vitest";
import { redactToken, setLogLevel } from "./logger.js";

describe("redactToken", () => {
  it("returns (none) for undefined", () => {
    expect(redactToken(undefined)).toBe("(none)");
  });

  it("returns (none) for empty string", () => {
    expect(redactToken("")).toBe("(none)");
  });

  it("returns *** for short tokens", () => {
    expect(redactToken("abc")).toBe("***");
    expect(redactToken("1234567")).toBe("***");
  });

  it("redacts with colon prefix", () => {
    expect(redactToken("123456:abcdefgh")).toBe("123456:***efgh");
  });

  it("redacts without colon prefix", () => {
    expect(redactToken("abcdefghij")).toBe("abcd:***ghij");
  });

  it("trims whitespace", () => {
    expect(redactToken("  123456:abcdefgh  ")).toBe("123456:***efgh");
  });
});

describe("setLogLevel", () => {
  it("does not throw for valid levels", () => {
    expect(() => setLogLevel("DEBUG")).not.toThrow();
    expect(() => setLogLevel("info")).not.toThrow();
    expect(() => setLogLevel("WARN")).not.toThrow();
    expect(() => setLogLevel("error")).not.toThrow();
  });

  it("throws for invalid level", () => {
    expect(() => setLogLevel("INVALID")).toThrow("Invalid log level");
  });
});
