import { buildChannelOutboundSessionRoute, stripChannelTargetPrefix, stripTargetKindPrefix, } from "openclaw/plugin-sdk/core";
const CHANNEL_ID = "openclaw-zaloclawbot";
export function normalizeClawbotRouteTarget(raw) {
    const trimmed = stripChannelTargetPrefix(raw, CHANNEL_ID, "zaloclawbot", "zclaw", "clawbot");
    const peerId = stripTargetKindPrefix(trimmed).trim();
    return peerId || undefined;
}
export function resolveClawbotOutboundSessionRoute(params) {
    const peerId = normalizeClawbotRouteTarget(params.target);
    if (!peerId)
        return null;
    return buildChannelOutboundSessionRoute({
        cfg: params.cfg,
        agentId: params.agentId,
        channel: CHANNEL_ID,
        accountId: params.accountId,
        peer: {
            kind: "direct",
            id: peerId,
        },
        chatType: "direct",
        from: `${CHANNEL_ID}:${peerId}`,
        to: `${CHANNEL_ID}:${peerId}`,
    });
}
