import { chunkMarkdownTextWithMode } from "openclaw/plugin-sdk/reply-chunking";
import { listClawbotAccountIds, resolveClawbotAccount } from "./auth/accounts.js";
import { runClawbotQrLoginLoop } from "./auth/login-flow.js";
import { sendClawbotText } from "./messaging/send.js";
import { resolveClawbotOutboundSessionRoute } from "./session-route.js";
import { logger } from "./util/logger.js";
const CHANNEL_ID = "openclaw-zaloclawbot";
const TARGET_PREFIX_RE = /^(?:openclaw-zaloclawbot|zaloclawbot|zclaw|clawbot):/i;
// The Bot Platform hard-caps a single text message at 2000 chars; a longer message is
// rejected. So the effective chunk limit can never exceed this regardless of config.
const ZALO_MESSAGE_HARD_LIMIT = 2000;
const DEFAULT_TEXT_CHUNK_LIMIT = 1990;
/** Clamp an operator-configured chunk limit into the platform's hard message cap. */
export function clampClawbotChunkLimit(limit) {
    const value = typeof limit === "number" && limit > 0 ? limit : DEFAULT_TEXT_CHUNK_LIMIT;
    return Math.min(value, ZALO_MESSAGE_HARD_LIMIT);
}
function normalizeClawbotMessagingTarget(raw) {
    const trimmed = raw?.trim();
    if (!trimmed)
        return undefined;
    const normalized = trimmed.replace(TARGET_PREFIX_RE, "").trim();
    return normalized || undefined;
}
function looksLikeClawbotTargetId(raw, normalized = raw) {
    const value = normalizeClawbotMessagingTarget(normalized) ?? normalizeClawbotMessagingTarget(raw);
    if (!value)
        return false;
    // Zalo Bot Platform chat IDs may be numeric on older surfaces or lowercase
    // hex-like identifiers on newer OA/private chat surfaces.
    return /^\d+$/.test(value) || /^[0-9a-f]{10,}$/i.test(value);
}
export const clawbotPlugin = {
    id: CHANNEL_ID,
    meta: {
        id: CHANNEL_ID,
        label: "Zalo ClawBot",
        selectionLabel: "Zalo ClawBot (QR)",
        docsPath: "/channels/zaloclawbot",
        docsLabel: "zaloclawbot",
        blurb: "Personal Zalo bot — QR-onboarded, owner-bound.",
        order: 81,
    },
    // Lazy proxy: keep the onboard setup/QR flow off this hot channel entrypoint and
    // load it only when the operator actually runs `openclaw onboard`.
    setupWizard: {
        channel: CHANNEL_ID,
        getStatus: async (ctx) => (await import("./setup/onboarding.js")).clawbotSetupWizard.getStatus(ctx),
        configure: async (ctx) => (await import("./setup/onboarding.js")).clawbotSetupWizard.configure(ctx),
        configureInteractive: async (ctx) => (await import("./setup/onboarding.js")).clawbotSetupWizard.configureInteractive(ctx),
    },
    configSchema: {
        schema: {
            type: "object",
            // Permissive so operators can also use OpenClaw's native streaming.* keys
            // (e.g. block-streaming coalescing) on this channel.
            additionalProperties: true,
            properties: {
                chunkMode: {
                    type: "string",
                    enum: ["length", "newline"],
                    description: "How to split long replies. 'length' (default): split only when a message exceeds textChunkLimit. 'newline': prefer paragraph boundaries for a more natural multi-message feel. Splitting is always markdown-safe.",
                },
                textChunkLimit: {
                    type: "integer",
                    minimum: 1,
                    maximum: ZALO_MESSAGE_HARD_LIMIT,
                    description: "Max characters per outgoing message (hard-capped at the platform's 2000-char limit; default 1990). Lower values chunk more aggressively; set to 2000 to keep a reply in one message whenever the platform allows.",
                },
            },
        },
    },
    capabilities: {
        chatTypes: ["direct"],
        media: false,
        blockStreaming: true,
    },
    streaming: {
        blockStreamingCoalesceDefaults: {
            minChars: 200,
            idleMs: 3000,
        },
    },
    reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },
    config: {
        listAccountIds: (cfg) => listClawbotAccountIds(cfg),
        resolveAccount: (cfg, accountId) => resolveClawbotAccount(cfg, accountId),
        isConfigured: (account) => account.configured,
        describeAccount: (account) => ({
            accountId: account.accountId,
            name: account.name,
            enabled: account.enabled,
            configured: account.configured,
        }),
    },
    outbound: {
        deliveryMode: "direct",
        // A chunker MUST be present for the host to honor chunkMode / textChunkLimit — with
        // no chunker the whole reply is sent as a single message and that config is ignored.
        // We delegate to OpenClaw's own markdown-aware splitter so a chunk never severs a
        // token (**, _, `, list item); each chunk is parsed independently by the Bot
        // Platform with parse_mode=markdown, so a split "**bold**" would otherwise render as
        // literal asterisks in both halves. Boundary preference is config-driven via chunkMode.
        chunker: (text, limit) => chunkMarkdownTextWithMode(text, limit, "length"),
        chunkerMode: "markdown",
        // Fallback when channels.openclaw-zaloclawbot.textChunkLimit is unset.
        textChunkLimit: DEFAULT_TEXT_CHUNK_LIMIT,
        // Clamp the resolved (operator-configured) limit to the platform's hard 2000 cap so
        // a misconfiguration can't produce a message the API rejects.
        resolveEffectiveTextChunkLimit: ({ fallbackLimit }) => clampClawbotChunkLimit(fallbackLimit),
        sendText: async (ctx) => {
            const account = resolveClawbotAccount(ctx.cfg, ctx.accountId);
            if (!account.botToken) {
                throw new Error("clawbot not configured: run `openclaw channels login --channel openclaw-zaloclawbot`");
            }
            const to = normalizeClawbotMessagingTarget(ctx.to);
            if (!to) {
                throw new Error(`invalid Zalo ClawBot target: ${ctx.to}`);
            }
            const result = await sendClawbotText({ to, text: ctx.text, token: account.botToken });
            return { channel: CHANNEL_ID, messageId: result.messageId };
        },
    },
    messaging: {
        targetPrefixes: [CHANNEL_ID, "zaloclawbot", "zclaw", "clawbot"],
        normalizeTarget: normalizeClawbotMessagingTarget,
        resolveOutboundSessionRoute: (params) => resolveClawbotOutboundSessionRoute(params),
        targetResolver: {
            looksLikeId: looksLikeClawbotTargetId,
            hint: "<chatId>",
        },
    },
    status: {
        defaultRuntime: {
            accountId: "",
            lastError: null,
            lastInboundAt: null,
            lastOutboundAt: null,
        },
        collectStatusIssues: () => [],
        buildChannelSummary: ({ snapshot }) => ({
            configured: snapshot.configured ?? false,
            lastError: snapshot.lastError ?? null,
            lastInboundAt: snapshot.lastInboundAt ?? null,
            lastOutboundAt: snapshot.lastOutboundAt ?? null,
        }),
        buildAccountSnapshot: ({ account, runtime }) => ({
            ...runtime,
            accountId: account.accountId,
            name: account.name,
            enabled: account.enabled,
            configured: account.configured,
        }),
    },
    auth: {
        login: async ({ cfg, accountId, runtime }) => {
            const sectionAccount = accountId
                ? resolveClawbotAccount(cfg, accountId)
                : { accountId: "" };
            const sessionServiceUrl = sectionAccount.sessionServiceUrl;
            const log = (m) => runtime?.log?.(m);
            const result = await runClawbotQrLoginLoop({
                sessionServiceUrl,
                // Standalone CLI login: bump the reload marker so a running gateway picks up
                // the new account. (Onboard setup leaves this off — the host writes config.)
                reloadConfigAfterLogin: true,
                ui: {
                    renderQr: (qr, loginUrl, attempt, max) => {
                        log(attempt > 1
                            ? `\nQR refreshed (${attempt}/${max}). Scan the new code with Zalo:\n`
                            : "\nScan the following QR with Zalo to confirm:\n");
                        if (qr) {
                            // Raw stdout so the QR grid stays square and scannable.
                            console.log(qr);
                            log(`If the QR didn't render, open this URL: ${loginUrl}`);
                        }
                        else {
                            log(`Open this URL in Zalo: ${loginUrl}`);
                        }
                    },
                    beginWait: (message) => {
                        log(`\n${message}\n`);
                        return { stop: (m) => log(m) };
                    },
                },
            });
            if (!result) {
                throw new Error("Zalo ClawBot login was not completed.");
            }
            log(`\n✅ Connected to Zalo. accountId=${result.accountId}`);
        },
    },
    gateway: {
        startAccount: async (ctx) => {
            if (!ctx) {
                logger.warn("gateway.startAccount: undefined ctx, skipping");
                return;
            }
            const account = ctx.account;
            const aLog = logger.withAccount(account.accountId);
            aLog.info(`gateway.startAccount: starting`);
            if (!account.configured) {
                aLog.error("not configured");
                ctx.log?.error?.(`[${account.accountId}] clawbot not logged in — run: openclaw channels login --channel openclaw-zaloclawbot`);
                ctx.setStatus?.({ accountId: account.accountId, running: false });
                throw new Error("clawbot not configured: missing token");
            }
            const { startClawbotProvider } = await import("./monitor/monitor.js");
            return startClawbotProvider({
                account,
                config: ctx.cfg,
                runtime: ctx.runtime,
                channelRuntime: ctx.channelRuntime,
                abortSignal: ctx.abortSignal,
                setStatus: ctx.setStatus,
            });
        },
    },
};
