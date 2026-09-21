const DEFAULT_ZALO_API_BASE = "https://bot-api.zaloplatforms.com";

function resolveZaloApiBase(): string {
  return (
    process.env.ZALOCLAWBOT_BOT_API_BASE_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_ZALO_API_BASE
  );
}

export interface ZaloApiEnvelope<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export class ZaloApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: number,
    public readonly description?: string,
  ) {
    super(message);
    this.name = "ZaloApiError";
  }

  get isPollingTimeout(): boolean {
    return this.errorCode === 408;
  }
}

function pollingTimeoutError(description = "getUpdates long-poll timeout"): ZaloApiError {
  return new ZaloApiError(description, 408, description);
}

export interface CallZaloApiOptions {
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export async function callZaloApi<T>(
  method: string,
  token: string,
  body?: unknown,
  options?: CallZaloApiOptions,
): Promise<ZaloApiEnvelope<T>> {
  const url = `${resolveZaloApiBase()}/bot${token}/${method}`;
  const controller = new AbortController();
  const timeoutId = options?.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;
  const fetcher = options?.fetch ?? fetch;

  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = (await response.json()) as ZaloApiEnvelope<T>;

    if (!data.ok) {
      throw new ZaloApiError(
        data.description ?? `Zalo API error: ${method}`,
        data.error_code,
        data.description,
      );
    }

    return data;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export interface ZaloBotInfo {
  id?: number;
  account_name?: string;
}

export interface ZaloSendMessageParams {
  chat_id: string;
  text: string;
  parse_mode?: string;
}

export interface ZaloSendMessageResult {
  message_id?: number;
}

export interface ZaloSendChatActionParams {
  chat_id: string;
  action: string;
}

export interface ZaloWebhookParams {
  url: string;
  secret_token?: string;
}

export interface ZaloWebhookInfo {
  url?: string;
}

export interface ZaloMessage {
  message_id?: number;
  text?: string;
  date?: number;
  chat?: {
    id?: string;
    chat_type?: string;
  };
  from?: {
    id?: string;
    display_name?: string;
  };
}

export interface ZaloUpdate {
  event_name?: string;
  message?: ZaloMessage;
}

export interface ZaloGetUpdatesParams {
  timeout?: number;
}

export async function getMe(
  token: string,
  timeoutMs?: number,
  fetcher?: typeof fetch,
): Promise<ZaloApiEnvelope<ZaloBotInfo>> {
  return callZaloApi<ZaloBotInfo>("getMe", token, undefined, { timeoutMs, fetch: fetcher });
}

export async function sendMessage(
  token: string,
  params: ZaloSendMessageParams,
  fetcher?: typeof fetch,
): Promise<ZaloApiEnvelope<ZaloSendMessageResult>> {
  return callZaloApi<ZaloSendMessageResult>("sendMessage", token, params, { fetch: fetcher });
}

export async function sendChatAction(
  token: string,
  params: ZaloSendChatActionParams,
  fetcher?: typeof fetch,
  timeoutMs?: number,
): Promise<ZaloApiEnvelope<unknown>> {
  return callZaloApi("sendChatAction", token, params, {
    fetch: fetcher,
    timeoutMs,
  });
}

export async function setWebhook(
  token: string,
  params: ZaloWebhookParams,
  fetcher?: typeof fetch,
): Promise<ZaloApiEnvelope<unknown>> {
  return callZaloApi("setWebhook", token, params, { fetch: fetcher });
}

export async function deleteWebhook(
  token: string,
  fetcher?: typeof fetch,
  timeoutMs?: number,
): Promise<ZaloApiEnvelope<unknown>> {
  return callZaloApi("deleteWebhook", token, undefined, {
    timeoutMs,
    fetch: fetcher,
  });
}

export async function getWebhookInfo(
  token: string,
  fetcher?: typeof fetch,
): Promise<ZaloApiEnvelope<ZaloWebhookInfo>> {
  return callZaloApi<ZaloWebhookInfo>("getWebhookInfo", token, undefined, { fetch: fetcher });
}

export async function getUpdates(
  token: string,
  params?: ZaloGetUpdatesParams,
  fetcher?: typeof fetch,
  abortSignal?: AbortSignal,
): Promise<ZaloApiEnvelope<ZaloUpdate>> {
  const pollTimeoutSec = params?.timeout ?? 30;
  const timeoutMs = (pollTimeoutSec + 5) * 1000;
  const body = { timeout: String(pollTimeoutSec) };
  const url = `${resolveZaloApiBase()}/bot${token}/getUpdates`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const effectiveFetch = fetcher ?? fetch;
  const abortLongPoll = () => controller.abort();

  if (abortSignal?.aborted) {
    controller.abort();
  } else {
    abortSignal?.addEventListener("abort", abortLongPoll, { once: true });
  }

  try {
    const response = await effectiveFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await response.text();
    const trimmed = raw.trim();

    if (!trimmed) {
      throw pollingTimeoutError("getUpdates returned empty long-poll response");
    }

    let data: ZaloApiEnvelope<ZaloUpdate>;
    try {
      data = JSON.parse(trimmed) as ZaloApiEnvelope<ZaloUpdate>;
    } catch (err) {
      if (trimmed.startsWith("<")) {
        throw pollingTimeoutError("getUpdates returned HTML long-poll timeout response");
      }
      throw err;
    }

    if (!data.ok) {
      throw new ZaloApiError(
        data.description ?? "Zalo API error: getUpdates",
        data.error_code,
        data.description,
      );
    }

    return data;
  } catch (err) {
    if (err instanceof ZaloApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw pollingTimeoutError("getUpdates client-side long-poll timeout");
    }
    throw err;
  } finally {
    abortSignal?.removeEventListener("abort", abortLongPoll);
    clearTimeout(timeoutId);
  }
}