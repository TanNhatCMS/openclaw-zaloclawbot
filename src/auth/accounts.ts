import fs from "node:fs";
import path from "node:path";
import { normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { logger } from "../util/logger.js";
import { resolveClawbotStateDir } from "../storage/state-dir.js";

function resolveAccountIndexPath(): string {
  return path.join(resolveClawbotStateDir(), "accounts.json");
}

function resolveAccountsDir(): string {
  return path.join(resolveClawbotStateDir(), "accounts");
}

function resolveAccountPath(accountId: string): string {
  return path.join(resolveAccountsDir(), `${accountId}.json`);
}

export interface ClawbotStoredAccount {
  botId?: string;
  botToken?: string;
  accountName?: string;
  ownerId?: string;
  oaId?: string;
  webhookSecret?: string;
  savedAt?: string;
}

export interface ClawbotChannelSection {
  enabled?: boolean;
  name?: string;
  sessionServiceUrl?: string;
  webhookBaseUrl?: string;
  accounts?: Record<string, ClawbotAccountSection>;
}

export interface ClawbotAccountSection {
  enabled?: boolean;
  name?: string;
  sessionServiceUrl?: string;
  webhookBaseUrl?: string;
}

export function listIndexedClawbotAccountIds(): string[] {
  const filePath = resolveAccountIndexPath();
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.trim() !== "");
  } catch {
    return [];
  }
}

export function registerClawbotAccountId(accountId: string): void {
  fs.mkdirSync(resolveClawbotStateDir(), { recursive: true });
  const existing = listIndexedClawbotAccountIds();
  if (existing.includes(accountId)) return;
  fs.writeFileSync(
    resolveAccountIndexPath(),
    JSON.stringify([...existing, accountId], null, 2),
    "utf-8",
  );
}

export function unregisterClawbotAccountId(accountId: string): void {
  const existing = listIndexedClawbotAccountIds();
  const updated = existing.filter((id) => id !== accountId);
  if (updated.length !== existing.length) {
    fs.writeFileSync(resolveAccountIndexPath(), JSON.stringify(updated, null, 2), "utf-8");
  }
}

export function loadClawbotAccount(accountId: string): ClawbotStoredAccount | null {
  try {
    const fp = resolveAccountPath(accountId);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as ClawbotStoredAccount;
  } catch (err) {
    logger.warn(`loadClawbotAccount: failed to read ${accountId}: ${String(err)}`);
    return null;
  }
}

export function saveClawbotAccount(
  accountId: string,
  update: {
    botId: string;
    botToken: string;
    accountName?: string;
    ownerId?: string;
    oaId?: string;
    webhookSecret?: string;
  },
): void {
  const dir = resolveAccountsDir();
  fs.mkdirSync(dir, { recursive: true });

  const existing = loadClawbotAccount(accountId) ?? {};
  const data: ClawbotStoredAccount = {
    botId: update.botId,
    botToken: update.botToken,
    accountName: update.accountName ?? existing.accountName,
    ownerId: update.ownerId ?? existing.ownerId,
    oaId: update.oaId ?? existing.oaId,
    webhookSecret: update.webhookSecret ?? existing.webhookSecret,
    savedAt: new Date().toISOString(),
  };

  const filePath = resolveAccountPath(accountId);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // best-effort
  }
}

export function clearClawbotAccount(accountId: string): void {
  try {
    fs.unlinkSync(resolveAccountPath(accountId));
  } catch {
    // ignore
  }
}

export function listClawbotAccountIds(_cfg: OpenClawConfig): string[] {
  return listIndexedClawbotAccountIds();
}

export interface ResolvedClawbotAccount {
  accountId: string;
  botId?: string;
  botToken?: string;
  accountName?: string;
  ownerId?: string;
  oaId?: string;
  webhookSecret?: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  sessionServiceUrl?: string;
  webhookBaseUrl?: string;
}

export function resolveClawbotAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): ResolvedClawbotAccount {
  const raw = accountId?.trim();
  if (!raw) {
    throw new Error("clawbot: accountId is required (no default account)");
  }

  const id = normalizeAccountId(raw);
  const section = (cfg.channels as Record<string, ClawbotChannelSection> | undefined)?.[
    "openclaw-zaloclawbot"
  ];
  const accountCfg = section?.accounts?.[id] ?? section ?? {};
  const accountData = loadClawbotAccount(id);

  return {
    accountId: id,
    botId: accountData?.botId,
    botToken: accountData?.botToken,
    accountName: accountData?.accountName,
    ownerId: accountData?.ownerId,
    oaId: accountData?.oaId,
    webhookSecret: accountData?.webhookSecret,
    enabled: accountCfg.enabled !== false,
    configured: Boolean(accountData?.botToken?.trim()),
    name: accountCfg.name?.trim() || accountData?.accountName?.trim() || undefined,
    sessionServiceUrl: accountCfg.sessionServiceUrl?.trim() ||
      section?.sessionServiceUrl?.trim() ||
      process.env.ZALOCLAWBOT_SESSION_SERVICE_URL?.trim() ||
      undefined,
    webhookBaseUrl: accountCfg.webhookBaseUrl?.trim() ||
      section?.webhookBaseUrl?.trim() ||
      process.env.ZALOCLAWBOT_WEBHOOK_BASE_URL?.trim() ||
      undefined,
  };
}