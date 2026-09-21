import { logger } from "./util/logger.js";

let pluginRuntime: ClawbotPluginRuntime | null = null;

export interface ClawbotPluginRuntime {
  version?: string;
  log?: (message: string) => void;
  error?: (message: string) => void;
  channel?: unknown;
  [key: string]: unknown;
}

export function setClawbotRuntime(next: ClawbotPluginRuntime): void {
  pluginRuntime = next;
  logger.info(`[runtime] setClawbotRuntime initialized`);
}

export function getClawbotRuntime(): ClawbotPluginRuntime {
  if (!pluginRuntime) {
    throw new Error("Clawbot runtime not initialized");
  }
  return pluginRuntime;
}

const WAIT_INTERVAL_MS = 100;
const DEFAULT_TIMEOUT_MS = 10_000;

export async function waitForClawbotRuntime(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ClawbotPluginRuntime> {
  const start = Date.now();
  while (!pluginRuntime) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Clawbot runtime initialization timeout");
    }
    await new Promise((r) => setTimeout(r, WAIT_INTERVAL_MS));
  }
  return pluginRuntime;
}

export async function resolveClawbotChannelRuntime(params: {
  channelRuntime?: unknown;
  waitTimeoutMs?: number;
}): Promise<unknown> {
  if (params.channelRuntime) return params.channelRuntime;
  if (pluginRuntime) return pluginRuntime.channel;
  const pr = await waitForClawbotRuntime(params.waitTimeoutMs ?? DEFAULT_TIMEOUT_MS);
  return pr.channel;
}