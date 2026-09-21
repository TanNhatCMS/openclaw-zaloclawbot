import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../auth/accounts.js", () => ({
  listIndexedClawbotAccountIds: vi.fn().mockReturnValue([]),
  loadClawbotAccount: vi.fn().mockReturnValue(null),
}));

vi.mock("../auth/login-flow.js", () => ({
  runClawbotQrLoginLoop: vi.fn(),
}));

import { clawbotSetupWizard } from "./onboarding.js";
import { listIndexedClawbotAccountIds, loadClawbotAccount } from "../auth/accounts.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("clawbotSetupWizard", () => {
  it("getStatus returns not configured when no accounts", async () => {
    const status = await clawbotSetupWizard.getStatus({} as any);
    expect(status.configured).toBe(false);
    expect(status.statusLines[0]).toContain("Not logged in");
  });

  it("getStatus returns configured when account has botToken", async () => {
    (listIndexedClawbotAccountIds as any).mockReturnValue(["acct-1"]);
    (loadClawbotAccount as any).mockReturnValue({ botToken: "tok-123" });
    const status = await clawbotSetupWizard.getStatus({} as any);
    expect(status.configured).toBe(true);
    expect(status.statusLines[0]).toContain("Logged in");
  });

  it("configure returns cfg unchanged when login not completed", async () => {
    const { runClawbotQrLoginLoop } = await import("../auth/login-flow.js");
    (runClawbotQrLoginLoop as any).mockResolvedValue(null);

    const result = await clawbotSetupWizard.configure!({
      cfg: {} as any,
      prompter: { note: vi.fn(), progress: vi.fn().mockReturnValue({ stop: vi.fn() }) } as any,
      runtime: {} as any,
      accountOverrides: [],
      shouldPromptAccountIds: false,
      forceAllowFrom: false,
    } as any);
    expect(result).toEqual({ cfg: {} });
  });

  it("channel id is openclaw-zaloclawbot", () => {
    expect(clawbotSetupWizard.channel).toBe("openclaw-zaloclawbot");
  });
});
