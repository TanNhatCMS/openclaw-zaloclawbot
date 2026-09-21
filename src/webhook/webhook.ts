import type { IncomingMessage, ServerResponse } from "node:http";
import { safeEqualSecret } from "openclaw/plugin-sdk/security-runtime";
import type { ZaloUpdate } from "../api/api.js";
import { logger } from "../util/logger.js";

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
  if (!id) return null;
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

const targetsByPath = new Map<string, ClawbotWebhookTarget>();

export function registerClawbotWebhookTarget(target: ClawbotWebhookTarget): () => void {
  targetsByPath.set(target.path, target);
  logger.info(`webhook: registered path=${target.path} accountId=${target.accountId}`);
  return () => {
    if (targetsByPath.get(target.path) === target) {
      targetsByPath.delete(target.path);
      logger.info(`webhook: unregistered path=${target.path}`);
    }
  };
}

export function lookupClawbotWebhookTarget(path: string): ClawbotWebhookTarget | undefined {
  return targetsByPath.get(path);
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
    logger.warn(`webhook: missing event_name path=${target.path}`);
    res.statusCode = 400;
    res.end("Bad Request");
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

  void target.processUpdate(update).catch((err: unknown) => {
    logger.error(`webhook: processUpdate failed accountId=${target.accountId}: ${String(err)}`);
  });
}