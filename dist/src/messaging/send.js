import { sendMessage } from "../api/api.js";
import { logger } from "../util/logger.js";
const ZALO_TEXT_LIMIT = 2000;
// OpenClaw agent replies are markdown, so we ask the Bot Platform to render
// them as rich text. This requires a backend that supports the rich-text
// feature; until that ships to production the plugin stays unpublished and is
// tested against a local/staging API via ZALOCLAWBOT_BOT_API_BASE_URL.
const PARSE_MODE = "markdown";
export async function sendClawbotText(params) {
    const { to, token } = params;
    const text = (params.text ?? "").slice(0, ZALO_TEXT_LIMIT);
    if (!to)
        throw new Error("clawbot send: chat_id is required");
    if (!token)
        throw new Error("clawbot send: bot token is required");
    const res = await sendMessage(token, { chat_id: to, text, parse_mode: PARSE_MODE });
    const messageId = String(res.result?.message_id ?? "");
    logger.info(`outbound: to=${to} textLen=${text.length} messageId=${messageId || "(none)"}`);
    return { messageId };
}
