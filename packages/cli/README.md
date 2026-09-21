# @zalo-platforms/openclaw-zaloclawbot-cli

One-shot installer for the [`@zalo-platforms/openclaw-zaloclawbot`](https://www.npmjs.com/package/@zalo-platforms/openclaw-zaloclawbot) channel plugin — the official personal Zalo bot for [OpenClaw](https://www.npmjs.com/package/openclaw).

## Usage

```sh
npx -y @zalo-platforms/openclaw-zaloclawbot-cli install
```

This runs the full sequence against your existing OpenClaw install:

1. Registers the plugin (`openclaw plugins install`)
2. Enables it in your config
3. Restarts the gateway so the plugin loads
4. Launches the QR login — scan it with the Zalo app to connect

> Prefer `openclaw onboard` for a first-time setup — it installs and logs in from the catalog inside the onboarding wizard. Use this installer when you just want to add the channel to an already-onboarded gateway, or in scripted setups.

## Options

- **`OPENCLAW_BIN`** — point at a specific `openclaw` binary if you have multiple installs:
  ```sh
  OPENCLAW_BIN=/path/to/openclaw npx -y @zalo-platforms/openclaw-zaloclawbot-cli install
  ```
  Otherwise the installer auto-detects the `openclaw` CLI on your `PATH` and prints which one it used.

If the gateway restart fails, rerun `openclaw gateway restart` once the plugin is installed.

## Requirements

- Node.js **>= 22**
- OpenClaw CLI **>= 2026.4.10** already installed

Full docs: <https://docs.openclaw.ai/channels/zaloclawbot>

## License

MIT
