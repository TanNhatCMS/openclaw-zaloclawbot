# openclaw-zaloclawbot

[![CI](https://github.com/TanNhatCMS/openclaw-zaloclawbot/actions/workflows/ci.yml/badge.svg)](https://github.com/TanNhatCMS/openclaw-zaloclawbot/actions/workflows/ci.yml)
[![Release](https://github.com/TanNhatCMS/openclaw-zaloclawbot/actions/workflows/release.yml/badge.svg)](https://github.com/TanNhatCMS/openclaw-zaloclawbot/actions/workflows/release.yml)

Monorepo containing the Zalo ClawBot ecosystem for [OpenClaw](https://www.npmjs.com/package/openclaw).

## Packages

| Package | Description |
|---------|-------------|
| [`packages/plugin`](./packages/plugin) | `@tannhatcms/openclaw-zaloclawbot` — Zalo channel plugin |
| [`packages/cli`](./packages/cli) | `@tannhatcms/openclaw-zaloclawbot-cli` — One-shot install CLI |

## Quick Start

### Recommended: `openclaw onboard`

```sh
openclaw onboard
```

Pick **Zalo ClawBot** from the channel menu — installs, renders QR, finishes login.

### One-shot installer

```sh
npx -y @tannhatcms/openclaw-zaloclawbot-cli install
```

Installs the plugin, enables it, restarts the gateway, and launches QR login.

### Manual install

```sh
openclaw plugins install "@tannhatcms/openclaw-zaloclawbot@latest"
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

Releases are automated via GitHub Actions. Package versions use the OpenClaw calendar format; GitHub release tags use the repository's `v0.0.x` release sequence. To publish a new version:

1. Update the version in all of these files:
   - `packages/plugin/package.json` → `"version"`
   - `packages/cli/package.json` → `"version"`
   - `packages/plugin/openclaw.plugin.json` → `"version"`
2. Commit and push:
   ```sh
   git add -A
   git commit -m "release: 2026.9.7"
   git tag v0.0.5
   git push origin main --tags
   ```
3. The [Release workflow](.github/workflows/release.yml) will automatically:
   - Typecheck, build, and test
   - Publish both packages to **npmjs.org**
   - Create or update a **GitHub Release** with tarball artifacts

The tag must be unique. If a tag has already been used, choose the next repository release tag instead of moving or overwriting the existing tag.

### Installing from npmjs.org

The release workflow publishes the packages to the public npm registry. Configure the `NPM_TOKEN` repository secret with a Granular Access Token that has publish access to both packages.

```sh
# Install the CLI from npmjs.org
npx -y @tannhatcms/openclaw-zaloclawbot-cli install
```

## License

MIT
