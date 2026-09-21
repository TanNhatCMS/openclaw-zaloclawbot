import { randomUUID } from "node:crypto";
function generateMessageSid() {
    return `openclaw-zaloclawbot:${randomUUID()}`;
}
function extractText(message) {
    return message.text?.trim() ?? "";
}
export function zaloUpdateToMsgContext(update, accountId) {
    const msg = update.message;
    if (!msg)
        return null;
    if (msg.chat?.chat_type !== "PRIVATE")
        return null;
    const text = extractText(msg);
    if (!text)
        return null;
    const senderId = msg.from?.id ?? "";
    const senderName = msg.from?.display_name?.trim() || undefined;
    const chatId = msg.chat?.id ?? senderId;
    const target = `openclaw-zaloclawbot:${chatId}`;
    return {
        Body: text,
        From: senderId,
        To: chatId,
        AccountId: accountId,
        OriginatingChannel: "openclaw-zaloclawbot",
        OriginatingTo: chatId,
        MessageSid: generateMessageSid(),
        Timestamp: typeof msg.date === "number" ? msg.date : undefined,
        Provider: "openclaw-zaloclawbot",
        Surface: "openclaw-zaloclawbot",
        ChatType: "direct",
        ConversationLabel: target,
        NativeDirectUserId: chatId,
        SenderId: senderId || undefined,
        SenderName: senderName,
        CommandBody: text,
    };
}
