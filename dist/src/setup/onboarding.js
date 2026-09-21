import { listIndexedClawbotAccountIds, loadClawbotAccount } from "../auth/accounts.js";
import { runClawbotQrLoginLoop } from "../auth/login-flow.js";
const CHANNEL_ID = "openclaw-zaloclawbot";
/** A login is "configured" once any account has a stored bot token. */
function hasConfiguredClawbotAccount() {
    return listIndexedClawbotAccountIds().some((id) => Boolean(loadClawbotAccount(id)?.botToken?.trim()));
}
function resolveSessionServiceUrl(cfg) {
    const section = cfg.channels?.[CHANNEL_ID];
    return (section?.sessionServiceUrl?.trim() ||
        process.env.ZALOCLAWBOT_SESSION_SERVICE_URL?.trim() ||
        undefined);
}
/** Mark the channel enabled so the gateway starts the freshly logged-in account. */
function enableClawbotChannel(cfg) {
    const section = cfg.channels?.[CHANNEL_ID] ?? {};
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            [CHANNEL_ID]: { ...section, enabled: true },
        },
    };
}
/**
 * Run the full in-TUI QR login: request a session, show the QR, wait for the
 * scan, persist the account, and enable the channel. Returns the config patch +
 * account id on success, or null when the login could not be completed (the
 * caller decides whether that means "leave config as-is" or "skip").
 */
async function runClawbotQrOnboarding(cfg, prompter) {
    const result = await runClawbotQrLoginLoop({
        sessionServiceUrl: resolveSessionServiceUrl(cfg),
        ui: {
            renderQr: async (qr, loginUrl, attempt, max) => {
                const title = attempt > 1
                    ? `Scan with Zalo — new QR (${attempt}/${max})`
                    : "Scan with Zalo (QR expires in 5 min)";
                await prompter.note("Scan the QR below with the Zalo app to connect your bot.", title);
                // Render the QR raw (NOT inside a note box): the box prefixes/pads each line,
                // which reflows the QR grid into non-square modules that won't scan.
                if (qr && prompter.plain) {
                    await prompter.plain(`\n${qr}\n`);
                }
                await prompter.note(`If the QR doesn't render, open this URL in Zalo:\n${loginUrl}`);
            },
            beginWait: (message) => {
                const progress = prompter.progress(message);
                return { stop: (m) => progress.stop(m) };
            },
        },
    });
    if (!result) {
        return null;
    }
    return { cfg: enableClawbotChannel(cfg), accountId: result.accountId };
}
export const clawbotSetupWizard = {
    channel: CHANNEL_ID,
    getStatus: async () => {
        const configured = hasConfiguredClawbotAccount();
        return {
            channel: CHANNEL_ID,
            configured,
            statusLines: configured
                ? ["Logged in — connected via Zalo QR."]
                : ["Not logged in — scan a QR with Zalo to connect a personal bot."],
            // Personal QR bot is a strong quickstart option when not yet configured.
            quickstartScore: configured ? 0 : 1,
        };
    },
    // Non-interactive fallback (e.g. headless): QR login needs a TTY, so leave the
    // config untouched rather than half-configuring the channel.
    configure: async ({ cfg, prompter }) => (await runClawbotQrOnboarding(cfg, prompter)) ?? { cfg },
    configureInteractive: async ({ cfg, prompter }) => (await runClawbotQrOnboarding(cfg, prompter)) ?? "skip",
};
