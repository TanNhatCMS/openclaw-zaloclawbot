import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  ZaloApiError,
  deleteWebhook,
  getUpdates,
  getWebhookInfo,
} from "../api/api.js";
import { resolveClawbotChannelRuntime } from "../runtime.js";
import { logger, redactToken } from "../util/logger.js";
import type { ResolvedClawbotAccount } from "../auth/accounts.js";
import { MessageIdDedupe } from "./dedupe.js";
import { processOneClawbotMessage } from "./process-message.js";

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
  aLog.info(`startClawbotProvider: polling mode token=${redactToken(token)}`);
  log(`[${account.accountId}] zaloclawbot starting in polling mode`);

  await clearStaleWebhook(token, account.accountId, log);

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