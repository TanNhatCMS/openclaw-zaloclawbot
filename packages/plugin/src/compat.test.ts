import { describe, it, expect } from "vitest";
import {
  parseOpenClawVersion,
  compareVersions,
  isHostVersionSupported,
  assertHostCompatibility,
  SUPPORTED_HOST_MIN,
} from "./compat.js";

describe("parseOpenClawVersion", () => {
  it("parses valid version string", () => {
    expect(parseOpenClawVersion("2026.4.10")).toEqual({ year: 2026, month: 4, day: 10 });
  });

  it("strips pre-release suffix", () => {
    expect(parseOpenClawVersion("2026.9.5-rc1")).toEqual({ year: 2026, month: 9, day: 5 });
  });

  it("returns null for malformed version", () => {
    expect(parseOpenClawVersion("bad")).toBeNull();
    expect(parseOpenClawVersion("")).toBeNull();
    expect(parseOpenClawVersion("2026.4")).toBeNull();
    expect(parseOpenClawVersion("abc.def.ghi")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(parseOpenClawVersion("  2026.1.1  ")).toEqual({ year: 2026, month: 1, day: 1 });
  });
});

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions({ year: 2026, month: 4, day: 10 }, { year: 2026, month: 4, day: 10 })).toBe(0);
  });

  it("compares year first", () => {
    expect(compareVersions({ year: 2027, month: 1, day: 1 }, { year: 2026, month: 12, day: 31 })).toBe(1);
    expect(compareVersions({ year: 2025, month: 12, day: 31 }, { year: 2026, month: 1, day: 1 })).toBe(-1);
  });

  it("compares month when year equal", () => {
    expect(compareVersions({ year: 2026, month: 5, day: 1 }, { year: 2026, month: 4, day: 30 })).toBe(1);
    expect(compareVersions({ year: 2026, month: 3, day: 31 }, { year: 2026, month: 4, day: 1 })).toBe(-1);
  });

  it("compares day when year and month equal", () => {
    expect(compareVersions({ year: 2026, month: 4, day: 11 }, { year: 2026, month: 4, day: 10 })).toBe(1);
    expect(compareVersions({ year: 2026, month: 4, day: 9 }, { year: 2026, month: 4, day: 10 })).toBe(-1);
  });
});

describe("isHostVersionSupported", () => {
  it("returns true for supported version", () => {
    expect(isHostVersionSupported("2026.9.5")).toBe(true);
    expect(isHostVersionSupported("2026.4.10")).toBe(true);
  });

  it("returns false for unsupported version", () => {
    expect(isHostVersionSupported("2026.4.9")).toBe(false);
    expect(isHostVersionSupported("2025.12.31")).toBe(false);
  });

  it("returns false for malformed version", () => {
    expect(isHostVersionSupported("bad")).toBe(false);
    expect(isHostVersionSupported("unknown")).toBe(false);
  });
});

describe("assertHostCompatibility", () => {
  it("does not throw for supported version", () => {
    expect(() => assertHostCompatibility("2026.9.5")).not.toThrow();
  });

  it("does not throw for unknown version", () => {
    expect(() => assertHostCompatibility("unknown")).not.toThrow();
    expect(() => assertHostCompatibility(undefined)).not.toThrow();
  });

  it("throws for unsupported version", () => {
    expect(() => assertHostCompatibility("2026.4.9")).toThrow(SUPPORTED_HOST_MIN);
  });
});
