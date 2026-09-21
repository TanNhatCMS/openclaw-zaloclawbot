# openclaw-zaloclawbot

[![CI](https://github.com/TanNhatCMS/openclaw-zaloclawbot/actions/workflows/ci.yml/badge.svg)](https://github.com/TanNhatCMS/openclaw-zaloclawbot/actions/workflows/ci.yml)
[![Release](https://github.com/TanNhatCMS/openclaw-zaloclawbot/actions/workflows/release.yml/badge.svg)](https://github.com/TanNhatCMS/openclaw-zaloclawbot/actions/workflows/release.yml)

Monorepo containing the Zalo ClawBot ecosystem for [OpenClaw](https://www.npmjs.com/package/openclaw).

## Packages

| Package | Description |
|---------|-------------|
| [`packages/plugin`](./packages/plugin) | `@TanNhatCMS/openclaw-zaloclawbot` — Zalo channel plugin |
| [`packages/cli`](./packages/cli) | `@TanNhatCMS/openclaw-zaloclawbot-cli` — One-shot install CLI |

## Quick Start

### Recommended: `openclaw onboard`

```sh
openclaw onboard
```

Pick **Zalo ClawBot** from the channel menu — installs, renders QR, finishes login.

### One-shot installer

```sh
npx -y @TanNhatCMS/openclaw-zaloclawbot-cli install
```

Installs the plugin, enables it, restarts the gateway, and launches QR login.

### Manual install

```sh
openclaw plugins install "@TanNhatCMS/openclaw-zaloclawbot@latest"
openclaw config set plugins.entries.openclaw-zaloclawbot.enabled true
openclaw gateway restart
openclaw channels login --channel openclaw-zaloclawbot
```

## How it works

- **Secure onboarding** — QR binds a freshly provisioned private bot to your Zalo User ID.
- **Owner-bound** — the bot talks only to its owner; messages from others are dropped.
- **Ban-safe** — uses official Bot Platform APIs, no unofficial web-spoof libraries.

## Development

```sh
npm install          # install all workspace dependencies
npm run build        # build all packages
npm run typecheck    # typecheck all TypeScript packages
npm run test         # run all tests
```

## Releasing

Releases are automated via GitHub Actions. To publish a new version:

1. Update the version in all of these files:
   - `packages/plugin/package.json` → `"version"`
   - `packages/cli/package.json` → `"version"`
   - `packages/plugin/openclaw.plugin.json` → `"version"`
2. Commit and push:
   ```sh
   git add -A
   git commit -m "release: vX.Y.Z"
   git tag vX.Y.Z
   git push origin main --tags
   ```
3. The [Release workflow](.github/workflows/release.yml) will automatically:
   - Typecheck, build, and test
   - Publish both packages to **GitHub Packages**
   - Create a **GitHub Release** with tarball artifacts

### Installing from GitHub Packages

To install packages from this repository's GitHub Packages registry:

```sh
# Configure npm to use GitHub Packages for @TanNhatCMS scope
npm config set @TanNhatCMS:registry https://npm.pkg.github.com

# Then install normally
npx -y @TanNhatCMS/openclaw-zaloclawbot-cli install
```

## License

MIT
