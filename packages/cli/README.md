# @tannhatcms/openclaw-zaloclawbot-cli

One-shot installer for the [`@tannhatcms/openclaw-zaloclawbot`](https://github.com/TanNhatCMS/openclaw-zaloclawbot) channel plugin — the official personal Zalo bot for [OpenClaw](https://www.npmjs.com/package/openclaw). It has a single subcommand, `install`.

## Usage

```sh
npx -y @tannhatcms/openclaw-zaloclawbot-cli install
```

Any other argument is rejected (`Unknown subcommand ... Supported: install`, exit 2).

This runs the full sequence against your existing OpenClaw install:

1. Finds the `openclaw` binary on your `PATH` (skipping `node_modules/.bin` entries, so it never mistakes this workspace's devDependency for your host install) and prints which one it uses, then runs `openclaw --version`.
2. Resolves the plugin version to install with `npm view @tannhatcms/openclaw-zaloclawbot@latest version` — or uses `ZALOCLAWBOT_PLUGIN_SPEC` if set (see below).
3. Checks the installed version with `openclaw plugins list --json`. If the plugin is already at the target version, the install step is skipped.
4. Otherwise installs it with `openclaw plugins install <pkg>@<version>` — no `--force`, so the install goes through OpenClaw's integrity-verified catalog path. If an older version is installed, it is first removed with `openclaw plugins uninstall openclaw-zaloclawbot --force`. The uninstall only skips the confirmation prompt; it does not touch the state-dir credentials, so an existing QR login survives a reinstall.
5. Links `~/.openclaw/extensions/openclaw-zaloclawbot` to the managed install for OpenClaw 2026.5.3 and older (newer hosts use the managed install record; the link is harmless there).
6. Enables the plugin: `openclaw config set plugins.entries.openclaw-zaloclawbot.enabled true`.
7. Restarts the gateway: `openclaw gateway restart`.
8. Launches the QR login: `openclaw channels login --channel openclaw-zaloclawbot` — scan it with the Zalo app to connect. The installer exits with the login command's exit code.

> Prefer `openclaw onboard` for a first-time setup — it installs and logs in from the catalog inside the onboarding wizard. Use this installer when you just want to add the channel to an already-onboarded gateway, or in scripted setups.

If the gateway restart fails, the installer stops there (before the QR login). Fix the gateway, rerun `openclaw gateway restart`, then log in manually with `openclaw channels login --channel openclaw-zaloclawbot`.

## Options

Environment variables:

- **`OPENCLAW_BIN`** — path to a specific `openclaw` binary when you have multiple installs. It must be executable; a non-executable value aborts the install:
  ```sh
  OPENCLAW_BIN=/path/to/openclaw npx -y @tannhatcms/openclaw-zaloclawbot-cli install
  ```
- **`ZALOCLAWBOT_PLUGIN_SPEC`** — install an exact spec instead of resolving `@latest`, e.g. `@tannhatcms/openclaw-zaloclawbot@2026.11.2`. Useful for pinning a known-good version or testing a prerelease (OpenClaw rejects `@latest` when it resolves to a prerelease, but accepts the same prerelease as an exact version).
- **`OPENCLAW_STATE_DIR`** — override the OpenClaw state directory (default `~/.openclaw`). Used to locate the managed install for the legacy compatibility link.
- **`OPENCLAW_HOME`** — home directory under which the state directory lives when `OPENCLAW_STATE_DIR` is not set (default: your OS home directory).

If `openclaw` is not on `PATH`, the installer prints how to get it (`npm install -g openclaw@latest`, then `openclaw onboard --install-daemon`) and exits 1.

## Webhook mode (optional)

After install, the channel long-polls by default. For production receiving via webhook instead, set a public HTTPS base URL in the channel config — the installer has no webhook flag; this is channel configuration, not an install option. See [`@tannhatcms/openclaw-zaloclawbot`](../plugin#receiving-messages-polling-vs-webhook) for setup, requirements, and limits.

## Requirements

- Node.js **>= 22**
- OpenClaw CLI already installed and on `PATH`. The plugin requires a host **>= 2026.4.10** (`minHostVersion`); the current release is built and tested against OpenClaw **2026.11.2**.

Full docs: <https://docs.openclaw.ai/channels/zaloclawbot>

## Development

This package ships only the installer (`bin/install.mjs`, exposed as the `openclaw-zaloclawbot-cli` binary) — it has no build or test scripts of its own. Compatibility of the plugin it installs is checked with the official [OpenClaw Plugin Inspector](https://github.com/openclaw/plugin-inspector) from the repo root:

```sh
# Fails on hard compatibility breakages against OpenClaw 2026.11.2.
npm run inspect

# Report only: always exits 0.
npm run inspect:report
```

Reports land in `packages/plugin/reports/` (gitignored); CI runs the same check on every push and pull request to `main`. See [`packages/plugin`](../plugin#compatibility-check-plugin-inspector) for the current result and the remaining inspector-side gaps. Runtime capture is opt-in only — it imports plugin code and the inspector is not a sandbox, so it is never enabled by default.

## License

MIT
