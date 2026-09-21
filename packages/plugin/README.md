# @zalo-platforms/openclaw-zaloclawbot

Official Zalo channel plugin for [OpenClaw](https://www.npmjs.com/package/openclaw). Connect a personal Zalo bot to your OpenClaw agent with a QR-scan login — owner-bound, no webhook setup, no developer credentials.

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
npx -y @zalo-platforms/openclaw-zaloclawbot-cli install
```

This installs the plugin, enables it, restarts the gateway, and launches the QR login. See [`@zalo-platforms/openclaw-zaloclawbot-cli`](https://www.npmjs.com/package/@zalo-platforms/openclaw-zaloclawbot-cli) for options (e.g. `OPENCLAW_BIN`).

### Manual install

```sh
# Use the exact pinned version so OpenClaw verifies the package against the
# official catalog integrity hash during install.
openclaw plugins install "@zalo-platforms/openclaw-zaloclawbot@0.1.4"
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

## License

MIT
