import { logger, redactToken } from "../util/logger.js";

const DEFAULT_SESSION_SERVICE_URL = "https://bot.zaloplatforms.com";
const ZBSK_TTL_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 1_500;

interface SessionServiceData {
  loginUrl?: string;
  zbsk?: string;
  isLogin?: boolean;
  botToken?: string;
  botId?: number | string;
  ownerId?: number | string;
  oaId?: number | string;
  code?: number;
}

interface SessionServiceEnvelope {
  ok?: boolean;
  result?: unknown;
  error_code?: number;
  description?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapSessionEnvelope(raw: unknown): {
  payload: SessionServiceData;
  ok?: boolean;
  errorCode?: number;
  description?: string;
} {
  if (!isRecord(raw) || !("result" in raw || "ok" in raw || "error_code" in raw)) {
    return { payload: isRecord(raw) ? (raw as SessionServiceData) : {} };
  }

  const envelope = raw as SessionServiceEnvelope;
  return {
    payload: isRecord(envelope.result) ? (envelope.result as SessionServiceData) : {},
    ok: envelope.ok,
    errorCode: envelope.error_code,
    description: envelope.description,
  };
}

function resolveBaseUrl(input: string | undefined): string {
  const trimmed = input?.trim();
  if (trimmed) return trimmed.replace(/\/+$/, "");
  return DEFAULT_SESSION_SERVICE_URL;
}

export interface RequestLoginResult {
  loginUrl?: string;
  zbsk?: string;
  message: string;
}

export async function requestLogin(params: {
  sessionServiceUrl?: string;
  fetch?: typeof fetch;
}): Promise<RequestLoginResult> {
  const base = resolveBaseUrl(params.sessionServiceUrl);
  const url = `${base}/agent/request-login`;
  const fetcher = params.fetch ?? fetch;

  try {
    logger.info(`request-login: GET ${url}`);
    const res = await fetcher(url, { method: "GET" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { message: `request-login failed: HTTP ${res.status} ${body.slice(0, 200)}` };
    }

    const { payload: data, description } = unwrapSessionEnvelope(await res.json());
    if (!data.loginUrl || !data.zbsk) {
      return {
        message: `request-login: malformed response (missing loginUrl or zbsk)${description ? `: ${description}` : ""}`,
      };
    }

    logger.info(`request-login: zbsk=${redactToken(data.zbsk)} loginUrl=${data.loginUrl}`);
    return {
      loginUrl: data.loginUrl,
      zbsk: data.zbsk,
      message: "Scan the QR with Zalo to confirm.",
    };
  } catch (err) {
    return { message: `request-login error: ${String(err)}` };
  }
}

export interface WaitForLoginResult {
  connected: boolean;
  botToken?: string;
  botId?: string;
  ownerId?: string;
  oaId?: string;
  message: string;
}

export async function waitForLogin(params: {
  sessionServiceUrl?: string;
  zbsk: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  fetch?: typeof fetch;
}): Promise<WaitForLoginResult> {
  const base = resolveBaseUrl(params.sessionServiceUrl);
  const deadline = Date.now() + (params.timeoutMs ?? ZBSK_TTL_MS);
  const fetcher = params.fetch ?? fetch;

  while (Date.now() < deadline) {
    if (params.abortSignal?.aborted) {
      return { connected: false, message: "Login aborted." };
    }

    let res: Response;
    try {
      const url = `${base}/agent/get-login-status?zbsk=${encodeURIComponent(params.zbsk)}`;
      res = await fetcher(url, { method: "GET" });
    } catch (err) {
      logger.warn(`get-login-status: network error, retrying: ${String(err)}`);
      await sleep(POLL_INTERVAL_MS, params.abortSignal);
      continue;
    }

    if (res.status === 498) {
      return { connected: false, message: "QR/session expired (498). Please re-run login." };
    }
    if (!res.ok && res.status !== 202) {
      const body = await res.text().catch(() => "");
      return {
        connected: false,
        message: `get-login-status failed: HTTP ${res.status} ${body.slice(0, 200)}`,
      };
    }

    let data: SessionServiceData;
    let errorCode: number | undefined;
    let description: string | undefined;
    try {
      const unwrapped = unwrapSessionEnvelope(await res.json());
      data = unwrapped.payload;
      errorCode = unwrapped.errorCode;
      description = unwrapped.description;
    } catch {
      data = {};
    }

    if (data.isLogin && data.botToken) {
      logger.info(
        `get-login-status: confirmed botId=${String(data.botId)} ownerId=${String(data.ownerId)} token=${redactToken(data.botToken)}`,
      );
      return {
        connected: true,
        botToken: data.botToken,
        botId: data.botId !== undefined ? String(data.botId) : undefined,
        ownerId: data.ownerId !== undefined ? String(data.ownerId) : undefined,
        oaId: data.oaId !== undefined ? String(data.oaId) : undefined,
        message: "Login confirmed.",
      };
    }

    if (data.code === 498 || errorCode === 498) {
      return { connected: false, message: "QR/session expired (498)." };
    }

    if (errorCode && errorCode !== 202 && errorCode !== 0) {
      return {
        connected: false,
        message: `get-login-status failed: ${description ?? `error_code ${errorCode}`}`,
      };
    }

    await sleep(POLL_INTERVAL_MS, params.abortSignal);
  }

  return { connected: false, message: "Login timeout (5 min)." };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}