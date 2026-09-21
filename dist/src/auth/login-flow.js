import { getMe } from "../api/api.js";
import { logger } from "../util/logger.js";
import { registerClawbotAccountId, saveClawbotAccount } from "./accounts.js";
import { resolveLoginAccountIdentity } from "./login-account.js";
import { requestLogin, waitForLogin } from "./login-qr.js";
const CHANNEL_ID = "openclaw-zaloclawbot";
// The Zalo login session (zbsk) is valid for 5 minutes; if it lapses before the
// user scans, request a fresh QR. Cap refreshes so a stuck flow can't loop forever.
const MAX_QR_REFRESH = 3;
/**
 * Render the Zalo login URL as a terminal QR string. Returns null when the
 * optional `qrcode-terminal` dependency is unavailable so callers can fall back
 * to printing the raw login URL.
 */
export async function renderClawbotLoginQr(loginUrl) {
    try {
        const qrcodeterminal = await import("qrcode-terminal");
        return await new Promise((resolve) => {
            qrcodeterminal.default.generate(loginUrl, { small: true }, (qr) => resolve(qr));
        });
    }
    catch (err) {
        logger.warn(`renderClawbotLoginQr: qrcode-terminal unavailable: ${String(err)}`);
        return null;
    }
}
/**
 * Persist a confirmed QR login: resolve the account identity (verifying via
 * getMe when possible), write the credential file, and register the account id.
 * Throws when the login was not actually confirmed.
 */
export async function persistClawbotLogin(wait) {
    if (!wait.connected || !wait.botToken) {
        throw new Error(wait.message);
    }
    let botId = wait.botId;
    let accountName;
    try {
        const me = await getMe(wait.botToken, 10_000);
        accountName = me.result?.account_name?.trim() || undefined;
        if (!botId) {
            botId = me.result?.id ? String(me.result.id) : undefined;
        }
    }
    catch (err) {
        logger.warn(`persistClawbotLogin: getMe verification failed: ${String(err)}`);
    }
    const identity = resolveLoginAccountIdentity({ botToken: wait.botToken, accountName, botId });
    if (identity.usedTokenFallback) {
        logger.warn(`persistClawbotLogin: using token-derived account id because getMe did not resolve botId tokenPublicId=${String(identity.tokenPublicId)}`);
    }
    saveClawbotAccount(identity.accountId, {
        botId: identity.storageBotId,
        botToken: wait.botToken,
        accountName: identity.accountName,
        ownerId: wait.ownerId,
        oaId: wait.oaId,
    });
    registerClawbotAccountId(identity.accountId);
    return { accountId: identity.accountId, accountName: identity.accountName };
}
/**
 * Drive the full QR login: request a session, render the QR, wait for the scan,
 * and persist on success. On expiry/timeout it requests a fresh QR (up to
 * MAX_QR_REFRESH) so a lapsed code self-heals instead of failing the flow.
 * Returns the connected account, or null when login could not be completed.
 */
export async function runClawbotQrLoginLoop(params) {
    const { sessionServiceUrl, ui, abortSignal } = params;
    for (let attempt = 1; attempt <= MAX_QR_REFRESH; attempt++) {
        const start = await requestLogin({ sessionServiceUrl });
        if (!start.zbsk || !start.loginUrl) {
            ui.beginWait("Requesting Zalo login session…").stop(start.message);
            return null;
        }
        const qr = await renderClawbotLoginQr(start.loginUrl);
        await ui.renderQr(qr, start.loginUrl, attempt, MAX_QR_REFRESH);
        const waiter = ui.beginWait("Waiting for Zalo login confirmation…");
        let wait;
        try {
            wait = await waitForLogin({ sessionServiceUrl, zbsk: start.zbsk, abortSignal });
        }
        catch (err) {
            waiter.stop(`Login error: ${String(err)}`);
            return null;
        }
        if (wait.connected && wait.botToken) {
            try {
                const result = await persistClawbotLogin(wait);
                if (params.reloadConfigAfterLogin) {
                    void triggerClawbotChannelReload();
                }
                waiter.stop(`Connected to Zalo. account ${result.accountId}`);
                return result;
            }
            catch (err) {
                waiter.stop(`Login failed: ${String(err)}`);
                return null;
            }
        }
        if (attempt < MAX_QR_REFRESH) {
            waiter.stop(`${wait.message} Generating a new QR (${attempt + 1}/${MAX_QR_REFRESH})…`);
            continue;
        }
        waiter.stop(`Login failed: ${wait.message}`);
    }
    return null;
}
/**
 * Bump a channel-section marker so the gateway reloads the channel after a fresh
 * login persists new credentials. Best-effort: a reload failure must not fail
 * the login itself.
 */
export async function triggerClawbotChannelReload() {
    try {
        const { loadConfig, writeConfigFile } = await import("openclaw/plugin-sdk/config-runtime");
        const cfg = loadConfig();
        const channels = (cfg.channels ?? {});
        const existing = channels[CHANNEL_ID] ?? {};
        const updated = {
            ...cfg,
            channels: {
                ...channels,
                [CHANNEL_ID]: {
                    ...existing,
                    channelConfigUpdatedAt: new Date().toISOString(),
                },
            },
        };
        await writeConfigFile(updated);
        logger.info("triggerClawbotChannelReload: bumped channelConfigUpdatedAt");
    }
    catch (err) {
        logger.warn(`triggerClawbotChannelReload: failed: ${String(err)}`);
    }
}
