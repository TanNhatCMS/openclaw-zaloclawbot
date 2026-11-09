import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  ZaloApiError,
  deleteWebhook,
  getUpdates,
  getWebhookInfo,
  setWebhook,
} from "../api/api.js";
import { resolveClawbotChannelRuntime } from "../runtime.js";
import { logger, redactToken } from "../util/logger.js";
import type { ResolvedClawbotAccount } from "../auth/accounts.js";
import { ensureClawbotWebhookSecret } from "../auth/accounts.js";
import { MessageIdDedupe } from "./dedupe.js";
import { processOneClawbotMessage } from "./process-message.js";
import {
  registerClawbotWebhookTarget,
  resolveClawbotWebhookUrl,
} from "../webhook/webhook.js";

const DEFAULT_LONG_POLL_SECONDS = 30;
const ERROR_BACKOFF_MS = 5_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const LONG_BACKOFF_MS = 30_000;

export type ClawbotStatusPatch = Record<string, unknown>;

export interface StartClawbotProviderOpts {
  account: ResolvedClawbotAccount;
  config: OpenClawConfig;
  abortSignal: AbortSignal;
  runtime?: { log?: (message: string) => void; error?: (message: string) => void };
  channelRuntime?: unknown;
  setStatus?: (patch: ClawbotStatusPatch) => void;
}

export async function startClawbotProvider(opts: StartClawbotProviderOpts): Promise<void> {
  const { account, config, abortSignal, runtime, channelRuntime, setStatus } = opts;
  const aLog = logger.withAccount(account.accountId);
  const log = runtime?.log ?? (() => {});
  const errLog = runtime?.error ?? ((m: string) => log(m));

  if (!account.botToken) {
    aLog.error("startClawbotProvider: not configured (no botToken)");
    errLog(
      `[${account.accountId}] zaloclawbot not logged in — run: openclaw channels login --channel openclaw-zaloclawbot`,
    );
    setStatus?.({ accountId: account.accountId, running: false });
    throw new Error("zaloclawbot not configured: missing botToken");
  }

  const token = account.botToken;

  const pluginRuntime = await resolveClawbotChannelRuntime({ channelRuntime });
  const dedupe = new MessageIdDedupe(200);

  setStatus?.({
    accountId: account.accountId,
    running: true,
    lastStartAt: Date.now(),
    lastEventAt: Date.now(),
  });

  let consecutiveFailures = 0;
  let processingTail: Promise<void> = Promise.resolve();

  const enqueueUpdate = (update: Parameters<typeof processOneClawbotMessage>[0]) => {
    processingTail = processingTail
      .catch(() => {
        // The previous task already logged its own error. Keep the queue alive.
      })
      .then(() =>
        processOneClawbotMessage(update, {
          accountId: account.accountId,
          botToken: token,
          config,
          channelRuntime: pluginRuntime,
          setStatus,
          log,
          errLog,
        }),
      )
      .catch((err: unknown) => {
        aLog.error(`process update failed: ${String(err)}`);
        errLog(`[${account.accountId}] process update failed: ${String(err)}`);
      });
  };

  const enqueueDedupedUpdate = (update: Parameters<typeof processOneClawbotMessage>[0]) => {
    const messageId = update.message?.message_id;
    if (messageId !== undefined && messageId !== null && dedupe.seen(messageId)) {
      aLog.debug(`dropped duplicate message_id=${messageId}`);
      return;
    }
    enqueueUpdate(update);
  };

  // Webhook mode (docs: webhook, setWebhook): when the operator configured a
  // public HTTPS base URL, Zalo POSTs events to the gateway instead of the
  // gateway long-polling. The two modes are mutually exclusive — polling
  // does not work while a webhook is configured.
  const webhookBaseUrl = account.webhookBaseUrl?.trim();
  if (webhookBaseUrl) {
    await startWebhookMode({
      account,
      token,
      webhookBaseUrl,
      abortSignal,
      log,
      errLog,
      setStatus,
      enqueueUpdate: enqueueDedupedUpdate,
    });
    aLog.info("webhook mode ended (aborted)");
    setStatus?.({ accountId: account.accountId, running: false });
    return;
  }

  aLog.info(`startClawbotProvider: polling mode token=${redactToken(token)}`);
  log(`[${account.accountId}] zaloclawbot starting in polling mode`);

  await clearStaleWebhook(token, account.accountId, log);

  while (!abortSignal.aborted) {
    try {
      const resp = await getUpdates(
        token,
        { timeout: DEFAULT_LONG_POLL_SECONDS },
        undefined,
        abortSignal,
      );
      consecutiveFailures = 0;
      setStatus?.({ accountId: account.accountId, lastEventAt: Date.now() });

      const update = resp.result;
      if (!update) {
        continue;
      }

      const messageId = update.message?.message_id;
      if (messageId && dedupe.seen(messageId)) {
        aLog.debug(`polling: dropped duplicate message_id=${messageId}`);
        continue;
      }

      enqueueUpdate(update);
    } catch (err) {
      if (abortSignal.aborted) break;

      if (err instanceof ZaloApiError && err.isPollingTimeout) {
        // No updates in the window — normal long-poll completion.
        consecutiveFailures = 0;
        continue;
      }

      consecutiveFailures += 1;
      aLog.error(
        `getUpdates failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${String(err)}`,
      );
      errLog(`[${account.accountId}] getUpdates failed: ${String(err)}`);

      const backoffMs =
        consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? LONG_BACKOFF_MS : ERROR_BACKOFF_MS;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        consecutiveFailures = 0;
      }
      await sleep(backoffMs, abortSignal);
    }
  }

  aLog.info("polling loop ended (aborted)");
  setStatus?.({ accountId: account.accountId, running: false });
}

async function startWebhookMode(params: {
  account: ResolvedClawbotAccount;
  token: string;
  webhookBaseUrl: string;
  abortSignal: AbortSignal;
  log: (message: string) => void;
  errLog: (message: string) => void;
  setStatus?: (patch: ClawbotStatusPatch) => void;
  enqueueUpdate: (update: Parameters<typeof processOneClawbotMessage>[0]) => void;
}): Promise<void> {
  const { account, token, webhookBaseUrl, abortSignal, log, errLog, setStatus, enqueueUpdate } =
    params;
  const aLog = logger.withAccount(account.accountId);

  // The secret is provisioned at login; older accounts get one generated and
  // persisted on first webhook-mode start (never sent anywhere except to
  // Zalo as the setWebhook secret_token).
  const secret = ensureClawbotWebhookSecret(account, token);
  const { url, path } = resolveClawbotWebhookUrl(webhookBaseUrl, account.accountId);

  aLog.info(`startClawbotProvider: webhook mode url=${url}`);
  log(`[${account.accountId}] zaloclawbot starting in webhook mode url=${url}`);

  const unregister = registerClawbotWebhookTarget({
    path,
    accountId: account.accountId,
    secret,
    processUpdate: async (update) => {
      setStatus?.({ accountId: account.accountId, lastEventAt: Date.now() });
      enqueueUpdate(update);
    },
  });

  try {
    const res = await setWebhook(token, { url, secret_token: secret });
    const verification = res.result?.verification;
    if (verification) {
      if (verification.ok) {
        aLog.info(`webhook registered: verification ok outcome=${verification.outcome ?? "?"}`);
        log(`[${account.accountId}] webhook verified: ${verification.outcome ?? "ok"}`);
      } else {
        // The URL stays registered server-side even when verification fails
        // (docs: setWebhook), so keep running — but say so loudly, and
        // re-check with testWebhook after fixing the endpoint.
        aLog.error(
          `webhook verification failed outcome=${verification.outcome ?? "?"} hint=${verification.hint ?? ""}`,
        );
        errLog(
          `[${account.accountId}] webhook verification failed (${verification.outcome ?? "?"}): ${verification.hint ?? "check that the public URL reaches this gateway, then re-check with testWebhook"}`,
        );
        setStatus?.({ accountId: account.accountId, lastError: verification.hint ?? verification.outcome ?? "webhook verification failed" });
      }
    }

    if (abortSignal.aborted) return;
    await new Promise<void>((resolve) => {
      abortSignal.addEventListener("abort", () => resolve(), { once: true });
    });
  } finally {
    unregister();
  }
}

async function clearStaleWebhook(
  token: string,
  accountId: string,
  log: (message: string) => void,
): Promise<void> {
  const aLog = logger.withAccount(accountId);
  try {
    const info = await getWebhookInfo(token);
    const url = info.result?.url?.trim();
    if (!url) {
      aLog.info("polling startup: no stale webhook configured");
      return;
    }
    aLog.info(`polling startup: clearing stale webhook url=${url}`);
    log(`[${accountId}] disabling pre-existing webhook before polling`);
    await deleteWebhook(token);
  } catch (err) {
    aLog.warn(`clearStaleWebhook: ${String(err)}`);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}