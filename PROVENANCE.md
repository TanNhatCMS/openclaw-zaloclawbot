# Provenance

This repository mirrors the npm package **`@zalo-platforms/openclaw-zaloclawbot`**.

- Source: `https://registry.npmjs.org/@zalo-platforms/openclaw-zaloclawbot`
- Version: `0.1.4`
- Tarball: `https://registry.npmjs.org/@zalo-platforms/openclaw-zaloclawbot/-/openclaw-zaloclawbot-0.1.4.tgz`
- Integrity (sha512): `5IxZriHJYACLL[...]g8LOtxM93VDYg==` (full: `5IxZriHJYACLLGqkCPPsTP9tas62kXEOFqTFAFMdunAM3SPhIJwVFRp0WvoP/m7L2PX85weD0g8LOtxM93VDYg==`)
- Author: Zalo Platforms (`ken-kuro`)
- License: MIT
- Extracted: 2026-09-21

## What is in this repo

The npm tarball contains the compiled plugin (`dist/`), the plugin entrypoint
`index.ts`, the OpenClaw plugin manifest (`openclaw.plugin.json`), `README.md`,
and `LICENSE`. The original TypeScript sources under `src/` were **not**
published to npm — only their compiled JavaScript output in `dist/` — so this
repo preserves the published artifact as-is and does not reconstruct the
missing sources.

The `dist/` output is committed intentionally: it is the runnable plugin code
and the only published form of the `src/` sources.

## Known gap in the published package

`package.json` declares both entry points:

```json
"openclaw": {
  "extensions": ["./index.ts"],
  "runtimeExtensions": ["./dist/index.js"]
}
```

`index.ts` imports `./src/channel.js`, `./src/compat.js` and `./src/runtime.js`,
but **no `src/` directory exists in the published tarball** — only the compiled
`dist/src/*.js`. As a result the `extensions` (source/dev-mode) entry point is
unresolvable as published, while the `runtimeExtensions` entry point
(`dist/index.js`) is complete and internally consistent: every relative import
under `dist/` resolves, and the only external imports are Node builtins
(`node:crypto`, `node:fs`, `node:os`, `node:path`) plus the `openclaw` plugin SDK
(`openclaw/plugin-sdk/*`).

Installed plugins load through `runtimeExtensions`, so this gap affects only
dev/source linking, not normal installed operation. It is recorded here rather
than patched, to keep this repo a faithful mirror of what was published.