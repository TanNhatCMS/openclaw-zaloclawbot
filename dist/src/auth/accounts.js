import fs from "node:fs";
import path from "node:path";
import { normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { logger } from "../util/logger.js";
import { resolveClawbotStateDir } from "../storage/state-dir.js";
function resolveAccountIndexPath() {
    return path.join(resolveClawbotStateDir(), "accounts.json");
}
function resolveAccountsDir() {
    return path.join(resolveClawbotStateDir(), "accounts");
}
function resolveAccountPath(accountId) {
    return path.join(resolveAccountsDir(), `${accountId}.json`);
}
export function listIndexedClawbotAccountIds() {
    const filePath = resolveAccountIndexPath();
    try {
        if (!fs.existsSync(filePath))
            return [];
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (!Array.isArray(parsed))
            return [];
        return parsed.filter((id) => typeof id === "string" && id.trim() !== "");
    }
    catch {
        return [];
    }
}
export function registerClawbotAccountId(accountId) {
    fs.mkdirSync(resolveClawbotStateDir(), { recursive: true });
    const existing = listIndexedClawbotAccountIds();
    if (existing.includes(accountId))
        return;
    fs.writeFileSync(resolveAccountIndexPath(), JSON.stringify([...existing, accountId], null, 2), "utf-8");
}
export function unregisterClawbotAccountId(accountId) {
    const existing = listIndexedClawbotAccountIds();
    const updated = existing.filter((id) => id !== accountId);
    if (updated.length !== existing.length) {
        fs.writeFileSync(resolveAccountIndexPath(), JSON.stringify(updated, null, 2), "utf-8");
    }
}
export function loadClawbotAccount(accountId) {
    try {
        const fp = resolveAccountPath(accountId);
        if (!fs.existsSync(fp))
            return null;
        return JSON.parse(fs.readFileSync(fp, "utf-8"));
    }
    catch (err) {
        logger.warn(`loadClawbotAccount: failed to read ${accountId}: ${String(err)}`);
        return null;
    }
}
export function saveClawbotAccount(accountId, update) {
    const dir = resolveAccountsDir();
    fs.mkdirSync(dir, { recursive: true });
    const existing = loadClawbotAccount(accountId) ?? {};
    const data = {
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
    }
    catch {
        // best-effort
    }
}
export function clearClawbotAccount(accountId) {
    try {
        fs.unlinkSync(resolveAccountPath(accountId));
    }
    catch {
        // ignore
    }
}
export function listClawbotAccountIds(_cfg) {
    return listIndexedClawbotAccountIds();
}
export function resolveClawbotAccount(cfg, accountId) {
    const raw = accountId?.trim();
    if (!raw) {
        throw new Error("clawbot: accountId is required (no default account)");
    }
    const id = normalizeAccountId(raw);
    const section = cfg.channels?.["openclaw-zaloclawbot"];
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
