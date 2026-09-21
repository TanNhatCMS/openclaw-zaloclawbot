import { createTypingCallbacks } from "openclaw/plugin-sdk/channel-outbound";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { sendChatAction, type ZaloUpdate } from "../api/api.js";
import { zaloUpdateToMsgContext } from "../messaging/inbound.js";
import { sendClawbotText } from "../messaging/send.js";
import { logger } from "../util/logger.js";

const ZALO_TYPING_TIMEOUT_MS = 5_000;

export interface ProcessMessageDeps {
  accountId: string;
  botToken: string;
  config: OpenClawConfig;
  channelRuntime: any;
  setStatus?: (patch: Record<string, unknown>) => void;
  log?: (message: string) => void;
  errLog?: (message: string) => void;
}

export async function processOneClawbotMessage(
  update: ZaloUpdate,
  deps: ProcessMessageDeps,
): Promise<void> {
  const aLog = logger.withAccount(deps.accountId);
  const ctx = zaloUpdateToMsgContext(update, deps.accountId);

  if (!ctx) {
    aLog.debug(`processOneClawbotMessage: non-actionable event=${update.event_name}`);
    return;
  }

  deps.setStatus?.({ accountId: deps.accountId, lastInboundAt: Date.now() });
  aLog.info(`inbound: from=${ctx.From} bodyLen=${ctx.Body.length}`);

  const route = deps.channelRuntime.routing.resolveAgentRoute({
    cfg: deps.config,
    channel: "openclaw-zaloclawbot",
    accountId: deps.accountId,
    peer: { kind: "direct", id: ctx.To },
  });

  if (!route.agentId) {
    aLog.error(`resolveAgentRoute: no agent for peer=${ctx.To}; message dropped`);
    return;
  }

  (ctx as { SessionKey?: string }).SessionKey = route.sessionKey;

  const storePath = deps.channelRuntime.session.resolveStorePath(deps.config.session?.store, {
    agentId: route.agentId,
  });

  const finalized = deps.channelRuntime.reply.finalizeInboundContext(ctx);

  const deliver = async (payload: { text?: string }) => {
    const text = payload.text ?? "";
    if (!text) return;
    try {
      await sendClawbotText({ to: ctx.To, text, token: deps.botToken });
      deps.setStatus?.({ accountId: deps.accountId, lastOutboundAt: Date.now() });
    } catch (err) {
      aLog.error(`outbound send failed: ${String(err)}`);
      throw err;
    }
  };

  const onReplyError = (err: unknown, info: { kind: string }) => {
    aLog.error(`reply ${info.kind} error: ${String(err)}`);
  };

  const typing = {
    start: async () => {
      await sendChatAction(
        deps.botToken,
        {
          chat_id: ctx.To,
          action: "typing",
        },
        undefined,
        ZALO_TYPING_TIMEOUT_MS,
      );
    },
    onStartError: (err: unknown) => {
      aLog.warn(`typing start failed: ${String(err)}`);
    },
  };

  const compatRuntime = deps.channelRuntime;
  const maybeRunAssembled = compatRuntime.turn?.runAssembled;
  const maybeDispatchReplyWithBufferedBlockDispatcher =
    compatRuntime.reply.dispatchReplyWithBufferedBlockDispatcher;

  if (
    typeof maybeRunAssembled === "function" &&
    typeof maybeDispatchReplyWithBufferedBlockDispatcher === "function"
  ) {
    const runAssembled = maybeRunAssembled;
    const dispatchReplyWithBufferedBlockDispatcher =
      maybeDispatchReplyWithBufferedBlockDispatcher;

    await runAssembled({
      cfg: deps.config,
      channel: "openclaw-zaloclawbot",
      accountId: deps.accountId,
      agentId: route.agentId,
      routeSessionKey: route.sessionKey,
      storePath,
      ctxPayload: finalized,
      recordInboundSession: deps.channelRuntime.session.recordInboundSession,
      dispatchReplyWithBufferedBlockDispatcher,
      delivery: {
        deliver,
        onError: onReplyError,
      },
      replyPipeline: {
        typing,
      },
      replyOptions: {
        disableBlockStreaming: true,
      },
      record: {
        updateLastRoute: {
          sessionKey: route.mainSessionKey,
          channel: "openclaw-zaloclawbot",
          to: ctx.To,
          accountId: deps.accountId,
        },
        onRecordError: (err: unknown) => aLog.error(`recordInboundSession: ${String(err)}`),
      },
    });
    return;
  }

  await deps.channelRuntime.session.recordInboundSession({
    storePath,
    sessionKey: route.sessionKey,
    ctx: finalized,
    updateLastRoute: {
      sessionKey: route.mainSessionKey,
      channel: "openclaw-zaloclawbot",
      to: ctx.To,
      accountId: deps.accountId,
    },
    onRecordError: (err: unknown) => aLog.error(`recordInboundSession: ${String(err)}`),
  });

  const humanDelay = deps.channelRuntime.reply.resolveHumanDelayConfig(
    deps.config,
    route.agentId,
  );

  const { dispatcher, replyOptions, markDispatchIdle } =
    deps.channelRuntime.reply.createReplyDispatcherWithTyping({
      humanDelay,
      typingCallbacks: createTypingCallbacks({
        start: typing.start,
        stop: async () => {},
        onStartError: typing.onStartError,
        onStopError: (err: unknown) => {
          aLog.warn(`typing stop failed: ${String(err)}`);
        },
        keepaliveIntervalMs: 5000,
      }),
      deliver,
      onError: onReplyError,
    });

  try {
    await deps.channelRuntime.reply.withReplyDispatcher({
      dispatcher,
      run: () =>
        deps.channelRuntime.reply.dispatchReplyFromConfig({
          ctx: finalized,
          cfg: deps.config,
          dispatcher,
          replyOptions: { ...replyOptions, disableBlockStreaming: true },
        }),
    });
  } finally {
    markDispatchIdle();
  }
}