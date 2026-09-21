import { randomUUID } from "node:crypto";
import type { ZaloMessage, ZaloUpdate } from "../api/api.js";

function generateMessageSid(): string {
  return `openclaw-zaloclawbot:${randomUUID()}`;
}

function extractText(message: ZaloMessage): string {
  return message.text?.trim() ?? "";
}

export interface ZaloInboundContext {
  Body: string;
  From: string;
  To: string;
  AccountId: string;
  OriginatingChannel: string;
  OriginatingTo: string;
  MessageSid: string;
  Timestamp?: number;
  Provider: string;
  Surface: string;
  ChatType: string;
  ConversationLabel: string;
  NativeDirectUserId: string;
  SenderId?: string;
  SenderName?: string;
  CommandBody: string;
}

export function zaloUpdateToMsgContext(
  update: ZaloUpdate,
  accountId: string,
): ZaloInboundContext | null {
  const msg = update.message;
  if (!msg) return null;
  if (msg.chat?.chat_type !== "PRIVATE") return null;

  const text = extractText(msg);
  if (!text) return null;

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