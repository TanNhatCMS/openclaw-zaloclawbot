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
  /**
   * Lets the server infer formatting from `text`. One of `markdown` | `html`.
   * When both `parse_mode` and `text_styles` are sent, `parse_mode` wins and
   * `text_styles` is ignored (docs: sendMessage).
   */
  parse_mode?: "markdown" | "html";
  /**
   * Explicit style runs over the raw `text` (UTF-16 offsets). Each run is
   * `{ start, len, st }`, e.g. `{ start: 0, len: 7, st: ["b", "c_db342e"] }`.
   * Ignored when `parse_mode` is also sent.
   */
  text_styles?: ZaloTextStyle[];
}

/** One explicit style run for `text_styles` (docs: sendMessage). */
export interface ZaloTextStyle {
  /** Start offset in UTF-16 code units. */
  start: number;
  /** Length in UTF-16 code units. */
  len: number;
  /** Style codes, e.g. `b`/`i`/`u`/`s`, `f_13`/`f_15`/`f_18`/`f_20`, `c_db342e`, `lst_1`, `ind_1`. */
  st: string[];
}

export interface ZaloSendMessageResult {
  message_id?: string | number;
  date?: number;
}

export interface ZaloSendChatActionParams {
  chat_id: string;
  action: string;
}

/**
 * Params for `sendVoice` (docs: sendVoice). Voice messages are audio-only
 * (no caption) and only work in 1-1 chats — a group `chat_id` may return
 * success without the message being delivered.
 */
export interface ZaloSendVoiceParams {
  chat_id: string;
  /** URL of the audio file. Must be a valid URL with a `.aac` extension. */
  voice_url: string;
}

export interface ZaloWebhookParams {
  /** Public HTTPS URL that receives Zalo's POST events. */
  url: string;
  /**
   * Secret (8–256 chars) Zalo sends back in the `X-Bot-Api-Secret-Token`
   * header of every webhook request. Required by the docs.
   */
  secret_token: string;
}

/**
 * Verification probe result returned by `setWebhook` and `testWebhook`
 * (docs: setWebhook, testWebhook). `ok` is true only when the webhook URL
 * answered 2xx; `outcome` classifies the result (`webhook.ok`,
 * `webhook.http.403` / `.404` / `.5xx` / `.other`, `webhook.err.tls`,
 * `webhook.err.unreachable`).
 */
export interface ZaloWebhookVerification {
  ok: boolean;
  url?: string;
  outcome?: string;
  hint?: string;
}

export interface ZaloWebhookSetResult {
  url?: string;
  updated_at?: number;
  verification?: ZaloWebhookVerification;
}

export interface ZaloWebhookInfo {
  url?: string;
  updated_at?: number;
}

export interface ZaloMessage {
  /** Message id. The docs show string ids (e.g. "2d758cb5e222177a4e35"). */
  message_id?: string | number;
  text?: string;
  /** Caption of a photo message (`message.image.received`). */
  caption?: string;
  /** Direct URL of a photo message (`message.image.received`). */
  photo_url?: string;
  /** e.g. `CHAT_TEXT`, `CHAT_PHOTO`. */
  message_type?: string;
  date?: number;
  chat?: {
    id?: string;
    chat_type?: string;
  };
  from?: {
    id?: string;
    display_name?: string;
    is_bot?: boolean;
  };
}

/**
 * One update delivered by `getUpdates` or a webhook POST. Known
 * `event_name` values (docs: webhook): `message.text.received`,
 * `message.image.received`, `message.sticker.received`,
 * `message.voice.received`, `message.unsupported.received`. The last one
 * replaces the message content for senders in protected categories, so the
 * platform deliberately withholds the content — there is nothing to process.
 */
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
  // Docs: sendMessage — text must be 1–2000 chars.
  const len = [...(params.text ?? "")].length;
  if (len < 1 || len > 2000) {
    throw new Error(`sendMessage: text must be 1–2000 characters (got ${len})`);
  }
  return callZaloApi<ZaloSendMessageResult>("sendMessage", token, params, { fetch: fetcher });
}

export async function sendVoice(
  token: string,
  params: ZaloSendVoiceParams,
  fetcher?: typeof fetch,
): Promise<ZaloApiEnvelope<ZaloSendMessageResult>> {
  // Docs: sendVoice — voice_url must be a valid URL with a `.aac` extension,
  // and voice only works in 1-1 chats (a group chat_id may return success
  // without delivering). No caption is supported.
  if (!params.chat_id?.trim()) {
    throw new Error("sendVoice: chat_id is required");
  }
  let voiceUrl: URL;
  try {
    voiceUrl = new URL(params.voice_url);
  } catch {
    throw new Error("sendVoice: voice_url must be a valid URL");
  }
  if (!/^https?:$/.test(voiceUrl.protocol) || !/\.aac$/i.test(voiceUrl.pathname)) {
    throw new Error("sendVoice: voice_url must be an http(s) URL ending in .aac");
  }
  return callZaloApi<ZaloSendMessageResult>("sendVoice", token, params, { fetch: fetcher });
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

/**
 * Validate `setWebhook` params against the docs (setWebhook): the URL must
 * be public HTTPS — `localhost`, `127.0.0.1` and private IPs (`10.x`,
 * `192.168.x`, `172.16–31.x`, …) are rejected by Zalo — and `secret_token`
 * is required, 8–256 chars. The URL is still saved server-side even when
 * Zalo's verification probe fails, so catching a bad URL here saves a
 * round-trip that would look like success.
 */
export function validateWebhookParams(params: ZaloWebhookParams): void {
  const secret = params.secret_token ?? "";
  if (secret.length < 8 || secret.length > 256) {
    throw new Error(
      `setWebhook: secret_token must be 8–256 characters (got ${secret.length})`,
    );
  }
  let url: URL;
  try {
    url = new URL(params.url);
  } catch {
    throw new Error(`setWebhook: url must be a valid URL (got ${params.url})`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`setWebhook: url must be HTTPS (got ${url.protocol}//…)`);
  }
  const host = url.hostname.toLowerCase();
  const isPrivateIp =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isPrivateIp) {
    throw new Error(
      `setWebhook: url must be publicly reachable (localhost/private IPs are rejected by Zalo): ${params.url}`,
    );
  }
}

export async function setWebhook(
  token: string,
  params: ZaloWebhookParams,
  fetcher?: typeof fetch,
): Promise<ZaloApiEnvelope<ZaloWebhookSetResult>> {
  validateWebhookParams(params);
  return callZaloApi<ZaloWebhookSetResult>("setWebhook", token, params, { fetch: fetcher });
}

/**
 * Re-probe the currently configured webhook URL (docs: testWebhook). No
 * params. `result.ok` — not the outer `ok` — tells whether the URL answered
 * 2xx. Rate-limited per bot per day; over the limit the API answers
 * `ok: false` with `errorCode` 426.
 */
export async function testWebhook(
  token: string,
  fetcher?: typeof fetch,
): Promise<ZaloApiEnvelope<ZaloWebhookVerification>> {
  return callZaloApi<ZaloWebhookVerification>("testWebhook", token, undefined, {
    fetch: fetcher,
  });
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

/**
 * Long-poll for new updates (docs: getUpdates). Body is `{ timeout: "<sec>" }`
 * (string, default 30). There is no `offset`/`update_id`: each response
 * carries a single update in `result` (or nothing when the window lapses).
 * Mutually exclusive with webhooks — it does not work while a webhook is
 * configured (call `deleteWebhook` first) — and the docs recommend it only
 * for local/dev/test; production should use a webhook to avoid missing events.
 */
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