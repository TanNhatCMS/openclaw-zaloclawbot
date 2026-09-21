const DEFAULT_ZALO_API_BASE = "https://bot-api.zaloplatforms.com";
function resolveZaloApiBase() {
    return (process.env.ZALOCLAWBOT_BOT_API_BASE_URL?.trim().replace(/\/+$/, "") ||
        DEFAULT_ZALO_API_BASE);
}
export class ZaloApiError extends Error {
    errorCode;
    description;
    constructor(message, errorCode, description) {
        super(message);
        this.errorCode = errorCode;
        this.description = description;
        this.name = "ZaloApiError";
    }
    get isPollingTimeout() {
        return this.errorCode === 408;
    }
}
function pollingTimeoutError(description = "getUpdates long-poll timeout") {
    return new ZaloApiError(description, 408, description);
}
export async function callZaloApi(method, token, body, options) {
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
        const data = (await response.json());
        if (!data.ok) {
            throw new ZaloApiError(data.description ?? `Zalo API error: ${method}`, data.error_code, data.description);
        }
        return data;
    }
    finally {
        if (timeoutId)
            clearTimeout(timeoutId);
    }
}
export async function getMe(token, timeoutMs, fetcher) {
    return callZaloApi("getMe", token, undefined, { timeoutMs, fetch: fetcher });
}
export async function sendMessage(token, params, fetcher) {
    return callZaloApi("sendMessage", token, params, { fetch: fetcher });
}
export async function sendChatAction(token, params, fetcher, timeoutMs) {
    return callZaloApi("sendChatAction", token, params, {
        fetch: fetcher,
        timeoutMs,
    });
}
export async function setWebhook(token, params, fetcher) {
    return callZaloApi("setWebhook", token, params, { fetch: fetcher });
}
export async function deleteWebhook(token, fetcher, timeoutMs) {
    return callZaloApi("deleteWebhook", token, undefined, {
        timeoutMs,
        fetch: fetcher,
    });
}
export async function getWebhookInfo(token, fetcher) {
    return callZaloApi("getWebhookInfo", token, undefined, { fetch: fetcher });
}
export async function getUpdates(token, params, fetcher, abortSignal) {
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
    }
    else {
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
        let data;
        try {
            data = JSON.parse(trimmed);
        }
        catch (err) {
            if (trimmed.startsWith("<")) {
                throw pollingTimeoutError("getUpdates returned HTML long-poll timeout response");
            }
            throw err;
        }
        if (!data.ok) {
            throw new ZaloApiError(data.description ?? "Zalo API error: getUpdates", data.error_code, data.description);
        }
        return data;
    }
    catch (err) {
        if (err instanceof ZaloApiError)
            throw err;
        if (err instanceof Error && err.name === "AbortError") {
            throw pollingTimeoutError("getUpdates client-side long-poll timeout");
        }
        throw err;
    }
    finally {
        abortSignal?.removeEventListener("abort", abortLongPoll);
        clearTimeout(timeoutId);
    }
}
