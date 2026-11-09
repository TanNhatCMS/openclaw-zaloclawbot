import type { IncomingMessage, ServerResponse } from "node:http";
import { safeEqualSecret } from "openclaw/plugin-sdk/security-runtime";
import {
  registerWebhookTargetWithPluginRoute,
  resolveWebhookPath,
  resolveWebhookTargetWithAuthOrRejectSync,
  withResolvedWebhookRequestPipeline,
} from "openclaw/plugin-sdk/webhook-ingress";
import { runDetachedWebhookWork } from "openclaw/plugin-sdk/webhook-request-guards";
import type { ZaloUpdate } from "../api/api.js";
import { logger } from "../util/logger.js";

const PLUGIN_ID = "openclaw-zaloclawbot";
const DEDUPE_TTL_MS = 5 * 60_000;
const DEDUPE_MAX_SIZE = 2000;
const MAX_BODY_BYTES = 1024 * 1024;
const BODY_READ_TIMEOUT_MS = 30_000;

const dedupe = new Map<string, number>();

function sweepDedupe(nowMs: number): void {
  if (dedupe.size < DEDUPE_MAX_SIZE) return;
  for (const [key, ts] of dedupe) {
    if (nowMs - ts > DEDUPE_TTL_MS) dedupe.delete(key);
  }
}

function isDuplicate(key: string, nowMs: number): boolean {
  sweepDedupe(nowMs);
  const prev = dedupe.get(key);
  if (prev !== undefined && nowMs - prev < DEDUPE_TTL_MS) return true;
  dedupe.set(key, nowMs);
  return false;
}

export interface ClawbotWebhookTarget {
  path: string;
  accountId: string;
  secret: string;
  processUpdate: (update: ZaloUpdate) => Promise<void>;
}

function dedupeKey(target: ClawbotWebhookTarget, update: ZaloUpdate): string | null {
  const id = update.message?.message_id;
  if (id === undefined || id === null) return null;
  return `${target.accountId}|${update.event_name}|${id}`;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    const timer = setTimeout(() => {
      req.removeAllListeners();
      reject(new Error("webhook: body read timeout"));
    }, BODY_READ_TIMEOUT_MS);

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        clearTimeout(timer);
        req.removeAllListeners();
        reject(new Error("webhook: body too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Caller-owned registry of live webhook targets, keyed by normalized path.
// The gateway HTTP route for a path is installed lazily by the core SDK on
// the first target for that path (see registerClawbotWebhookTarget).
const targetsByPath = new Map<string, ClawbotWebhookTarget[]>();

export function registerClawbotWebhookTarget(target: ClawbotWebhookTarget): () => void {
  const { unregister } = registerWebhookTargetWithPluginRoute({
    targetsByPath,
    target,
    route: {
      // Stable module-level handler (not a per-account closure) so the core
      // can resolve this plugin's instance owner when the route is hit.
      handler: handleClawbotWebhookHttpRequest,
      // "plugin": the plugin authenticates requests itself via the
      // X-Bot-Api-Secret-Token header (docs: webhook) — no gateway auth.
      auth: "plugin",
      pluginId: PLUGIN_ID,
      source: PLUGIN_ID,
      log: (message: string) => logger.info(message),
    },
  });
  logger.info(`webhook: registered path=${target.path} accountId=${target.accountId}`);
  return () => {
    unregister();
    logger.info(`webhook: unregistered path=${target.path}`);
  };
}

export function lookupClawbotWebhookTarget(path: string): ClawbotWebhookTarget | undefined {
  return targetsByPath.get(path)?.[0];
}

/**
 * Build the public webhook URL for an account from the operator-configured
 * base URL (docs: setWebhook — must be public HTTPS) and resolve the
 * gateway route path from it, so the registered Zalo URL and the local route
 * can never disagree. The per-account path keeps accounts separate when
 * several share one gateway.
 */
export function resolveClawbotWebhookUrl(
  baseUrl: string,
  accountId: string,
): { url: string; path: string } {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const url = `${base}/openclaw-zaloclawbot/${accountId}`;
  const path = resolveWebhookPath({ webhookUrl: url });
  if (!path) {
    throw new Error(`webhook: cannot resolve route path from webhook URL ${url}`);
  }
  return { url, path };
}

/**
 * Gateway HTTP route handler for Zalo webhook POSTs. Runs the core's
 * webhook request pipeline (POST-only, in-flight limiting), resolves the
 * live targets for the path, then picks the one whose secret matches the
 * `X-Bot-Api-Secret-Token` header (docs: webhook). Returns false when the
 * path has no live targets.
 */
export async function handleClawbotWebhookHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean | void> {
  const headerToken = String(headerValue(req.headers["x-bot-api-secret-token"]) ?? "");
  return withResolvedWebhookRequestPipeline({
    req,
    res,
    targetsByPath,
    allowMethods: ["POST"],
    handle: async ({ targets }) => {
      const target = resolveWebhookTargetWithAuthOrRejectSync({
        res,
        targets,
        isMatch: (candidate) => safeEqualSecret(headerToken, candidate.secret),
      });
      if (!target) return;
      await handleClawbotWebhookRequest(req, res, target);
    },
  });
}

export async function handleClawbotWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
  target: ClawbotWebhookTarget,
): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end("Method Not Allowed");
    return;
  }

  const headerToken = String(headerValue(req.headers["x-bot-api-secret-token"]) ?? "");
  if (!safeEqualSecret(headerToken, target.secret)) {
    logger.warn(`webhook: secret mismatch path=${target.path}`);
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch (err) {
    logger.warn(`webhook: bad body path=${target.path}: ${String(err)}`);
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  // Zalo sends updates directly; some flows may wrap as { ok, result }.
  const record = raw && typeof raw === "object" ? (raw as Record<string, any>) : null;
  const update = record && record.ok === true && record.result
    ? (record.result as ZaloUpdate)
    : (record ?? undefined);

  if (!update?.event_name) {
    // Ack 200 and drop: Zalo's setWebhook/testWebhook verification probe
    // only needs a 2xx to report `webhook.ok`, and its probe payload is not
    // a real event — answering 400 would report the endpoint as broken
    // while real events still work. Nothing to process here either way.
    logger.warn(`webhook: missing event_name path=${target.path}; acked and dropped`);
    res.statusCode = 200;
    res.end("ok");
    return;
  }

  // 200-ack immediately; Zalo has no documented retry semantics.
  res.statusCode = 200;
  res.end("ok");

  const key = dedupeKey(target, update);
  if (key && isDuplicate(key, Date.now())) {
    logger.debug(`webhook: duplicate dropped key=${key}`);
    return;
  }

  // Post-ack work runs detached so a gateway drain waits for it instead of
  // refusing queue enqueues once the request admission is released.
  void Promise.resolve(
    runDetachedWebhookWork(() => target.processUpdate(update)),
  ).catch((err: unknown) => {
    logger.error(`webhook: processUpdate failed accountId=${target.accountId}: ${String(err)}`);
  });
}
