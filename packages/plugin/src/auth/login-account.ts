import { createHash } from "node:crypto";
import { normalizeAccountId } from "openclaw/plugin-sdk/account-id";

function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
}

export function parseBotTokenPublicId(token: string): string | undefined {
  const match = /^(\d+):[A-Za-z0-9_-]+$/.exec(token.trim());
  return match?.[1];
}

export interface LoginAccountIdentity {
  accountId: string;
  storageBotId: string;
  accountName?: string;
  tokenPublicId?: string;
  usedTokenFallback: boolean;
}

export function resolveLoginAccountIdentity(params: {
  botToken: string;
  accountName?: string;
  botId?: string;
}): LoginAccountIdentity {
  const accountName = params.accountName?.trim();
  const botId = params.botId?.trim();

  if (accountName) {
    return {
      accountId: normalizeAccountId(`clawbot-${accountName}`),
      storageBotId: botId || accountName,
      accountName,
      usedTokenFallback: false,
    };
  }

  if (botId) {
    return {
      accountId: normalizeAccountId(`clawbot-${botId}`),
      storageBotId: botId,
      usedTokenFallback: false,
    };
  }

  const tokenPublicId = parseBotTokenPublicId(params.botToken);
  const fallbackKey = tokenPublicId
    ? `token-${tokenPublicId}-${tokenFingerprint(params.botToken)}`
    : `token-${tokenFingerprint(params.botToken)}`;

  return {
    accountId: normalizeAccountId(`clawbot-${fallbackKey}`),
    storageBotId: fallbackKey,
    tokenPublicId,
    usedTokenFallback: true,
  };
}