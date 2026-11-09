# @tannhatcms/openclaw-zaloclawbot

Official Zalo channel plugin for [OpenClaw](https://www.npmjs.com/package/openclaw). Connect a personal Zalo bot to your OpenClaw agent with a QR-scan login — owner-bound, no developer credentials. Built and tested against OpenClaw **2026.11.2**.

## Prerequisites

- Node.js **>= 22**
- OpenClaw CLI **>= 2026.4.10** installed:
  ```sh
  npm install -g openclaw@latest
  ```
- A Zalo account on a mobile device (used to scan the login QR)

## Install

### Recommended: `openclaw onboard`

Run the OpenClaw onboarding wizard and pick **Zalo ClawBot** from the channel menu:

```sh
openclaw onboard
```

The wizard installs the plugin from the official catalog (integrity-verified), renders the login QR right in the terminal, and finishes the channel once you scan it with Zalo — no extra commands.

### One-shot installer

If you just want to add the channel to an already-onboarded gateway:

```sh
npx -y @tannhatcms/openclaw-zaloclawbot-cli install
```

This installs the plugin, enables it, restarts the gateway, and launches the QR login. See [`@tannhatcms/openclaw-zaloclawbot-cli`](https://github.com/TanNhatCMS/openclaw-zaloclawbot/tree/main/packages/cli) for options (e.g. `OPENCLAW_BIN`).

### Manual install

```sh
# Use the exact pinned version so OpenClaw verifies the package against the
# official catalog integrity hash during install.
openclaw plugins install "@tannhatcms/openclaw-zaloclawbot@latest"
openclaw config set plugins.entries.openclaw-zaloclawbot.enabled true
openclaw channels login --channel openclaw-zaloclawbot
openclaw gateway restart
```

Full instructions and troubleshooting: <https://docs.openclaw.ai/channels/zaloclawbot>

## How it works

Unlike the developer Zalo channel (which needs your own Official Account and static credentials), Zalo ClawBot is an **owner-bound personal assistant** on official Zalo Bot Platform infrastructure:

- **Secure onboarding** — the QR binds a freshly provisioned private bot to your Zalo User ID.
- **Owner-bound** — the bot talks only to its owner; messages from others are dropped at the platform level.
- **Ban-safe** — it uses official Bot Platform APIs, with none of the suspension risk of unofficial web-spoof libraries.

## Receiving messages: polling vs webhook

The plugin speaks the official Zalo Bot Platform API ([docs](https://bot.zapps.me/docs)). The two receive modes are **mutually exclusive** — Zalo delivers to one or the other, never both.

### Polling (default)

When no webhook is configured, the gateway long-polls `getUpdates` (30 s window, one update per response). This is what the Zalo docs recommend for local/dev/test. On startup the plugin clears any stale webhook registration left on the bot so polling actually works.

### Webhook mode (production)

Set a public HTTPS base URL and the gateway switches to webhook mode:

```jsonc
// openclaw.json → channels.openclaw-zaloclawbot
{
  "webhookBaseUrl": "https://example.com"
}
```

What happens then:

- The gateway registers `https://example.com/openclaw-zaloclawbot/<accountId>` on the bot via `setWebhook`, and serves it on the gateway's own HTTP listener (registered through OpenClaw's plugin webhook route — no separate server to run).
- Zalo immediately probes the URL and returns a `verification` result (`webhook.ok`, `webhook.http.403` / `.404` / `.5xx`, `webhook.err.tls`, `webhook.err.unreachable`); the plugin logs the outcome at startup. The URL stays registered even if verification fails — fix the endpoint and re-check with `testWebhook`.
- Every delivery is authenticated: Zalo sends the secret in the `X-Bot-Api-Secret-Token` header, and the gateway compares it in constant time against the per-account secret. The secret is generated automatically at login (64 hex chars), stored `0600` next to the bot token, and never sent anywhere except to Zalo as the `setWebhook` `secret_token`.
- Duplicate deliveries are dropped (5-minute dedupe window).

Requirements and limits (from the Zalo docs):

- The URL **must be public HTTPS**. `localhost`, `127.0.0.1`, and private IPs (`10.x`, `192.168.x`, `172.16–31.x`) are rejected by Zalo. For local development, expose the gateway through a tunnel such as ngrok or Cloudflare Tunnel and register that public URL.
- Removing `webhookBaseUrl` returns the channel to polling; the next polling start deletes the webhook registration.
- `testWebhook` is rate-limited per bot per day (over the limit it answers `ok: false` with error `426`).

## What reaches the agent

| Zalo event | Handling |
|---|---|
| `message.text.received` | Text is routed to the agent (private chats only). |
| `message.image.received` | The photo's `caption` is routed as the message body; a photo without a caption is dropped. |
| `message.unsupported.received` | Dropped and logged. Zalo sends this instead of content for senders in protected categories, so there is deliberately nothing to process. |
| Sticker / voice inbound | Dropped — they carry no text for the agent. |

## Sending messages

- **Text** (`sendMessage`) — agent replies are sent as Markdown (`parse_mode: "markdown"`), so bold/italic/lists render as rich text. One message is capped at 2000 chars by the platform; longer replies are split by the plugin's markdown-aware chunker (see `textChunkLimit` below). The API client also supports explicit `text_styles` runs (UTF-16 offsets) — when both `parse_mode` and `text_styles` are sent, `parse_mode` wins.
- **Voice** (`sendVoice`) — available in the Bot API client for `.aac` audio URLs in 1-1 chats only (a group `chat_id` may return success without delivering, and voice carries no caption). The channel itself sends text replies only.

## Configuration

Channel section `channels.openclaw-zaloclawbot` in `openclaw.json`:

| Key | Default | Description |
|---|---|---|
| `webhookBaseUrl` | — (polling) | Public HTTPS base URL of this gateway. When set, the channel runs in webhook mode (see above). |
| `textChunkLimit` | `1990` | Max characters per outgoing message (hard-capped at the platform's 2000). |
| `chunkMode` | `"length"` | `"length"` splits only when a message exceeds the limit; `"newline"` prefers paragraph boundaries. |

## Compatibility check (plugin-inspector)

Every change is checked against the target OpenClaw release with the official
[`@openclaw/plugin-inspector`](https://github.com/openclaw/plugin-inspector)
(`0.4.6`, static analysis, offline, no credentials). The plugin declares its
compatibility in `package.json` (`openclaw.compat.pluginApi: ">=2026.4.10"`)
and its display name in `openclaw.plugin.json` (`"name": "Zalo ClawBot"`).

```sh
# From the repo root (or packages/plugin). Fails the command on hard breakages.
npm run inspect

# Report only: always exits 0, writes the reports below.
npm run inspect:report
```

This runs `plugin-inspector check --openclaw-version 2026.11.2` and writes:

- `packages/plugin/reports/plugin-inspector-report.json`
- `packages/plugin/reports/plugin-inspector-report.md`
- `packages/plugin/reports/plugin-inspector-issues.md`

Reports are gitignored build output. CI runs the same check on every push and
pull request to `main` (`.github/workflows/ci.yml`, after the test step).

Current state: **PASS, 0 breakages, 0 warnings** against OpenClaw 2026.11.2.
Four open items remain, all on the inspector side — none is a plugin defect:

- `missing-compat-record` (P1) — the target OpenClaw compat registry has no
  record for `channel.runtime.envelope-config-metadata`; only OpenClaw core
  can add it.
- `channel-contract-probe`, `package-dependency-install-required`,
  `package-typescript-source-entrypoint` — inspector proof gaps: the channel
  envelope/config probes and the cold-import path need runtime capture or an
  isolated dependency install, which the inspector itself flags as follow-up
  work. The plugin ships compiled `dist/index.js` as its runtime entrypoint,
  so the TypeScript-source note does not affect installed users.

Runtime capture is **opt-in, not part of the default check**: it imports
plugin code (the inspector is not a sandbox) and its output is not redacted,
so only run it on code you trust:

```sh
npx @openclaw/plugin-inspector ci --openclaw-version 2026.11.2 --runtime --mock-sdk --allow-execute
```

## License

MIT
