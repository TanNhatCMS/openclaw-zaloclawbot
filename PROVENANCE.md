# Provenance

This repository mirrors the npm package **`@zalo-platforms/openclaw-zaloclawbot`**.

- Source: `https://registry.npmjs.org/@zalo-platforms/openclaw-zaloclawbot`
- Version: `0.1.4`
- Tarball: `https://registry.npmjs.org/@zalo-platforms/openclaw-zaloclawbot/-/openclaw-zaloclawbot-0.1.4.tgz`
- Integrity (sha512): `5IxZriHJYACLLGqkCPPsTP9tas62kXEOFqTFAFMdunAM3SPhIJwVFRp0WvoP/m7L2PX85weD0g8LOtxM93VDYg==`
- Author: Zalo Platforms (`ken-kuro`)
- License: MIT
- Extracted: 2026-09-21

## What is in this repo

The npm tarball ships the compiled plugin (`dist/`), the plugin entrypoint
`index.ts`, the OpenClaw plugin manifest (`openclaw.plugin.json`), `README.md`,
and `LICENSE`. The original TypeScript sources under `src/` were **not**
published to npm — only their compiled JavaScript output in `dist/`.

Two trees are therefore committed:

- `dist/` — the published artifact, byte-for-byte as it appears in the tarball.
- `src/` — TypeScript sources reconstructed from `dist/` (see below).

## Reconstruction of `src/`

`src/**/*.ts` was written by hand from the published `dist/**/*.js`, with types
taken from the real `openclaw` plugin SDK (`openclaw@2026.5.18`, the version the
package pins as a devDependency) rather than invented.

The reconstruction is verified, not asserted:

```sh
npm install
npx tsc --noEmit          # typecheck: clean
npx tsc --outDir /tmp/out # then diff /tmp/out against dist/
```

Compiling `src/` reproduces **all 19 published `dist/**/*.js` files
byte-for-byte identical** to the tarball output. `tsconfig.json` mirrors the
compiler settings implied by the published output (NodeNext ESM, ES2023 target,
`outDir: dist`, `rootDir: .`).

Type-only imports and annotations are erased at compile time, so they do not
affect the emitted JavaScript. Where the emitted shape would otherwise drift
(parameter destructuring, parenthesization, import specifier grouping), the
source is written to match the published output exactly.

## Known gap in the published package

`package.json` declares both entry points:

```json
"openclaw": {
  "extensions": ["./index.ts"],
  "runtimeExtensions": ["./dist/index.js"]
}
```

Before reconstruction, `index.ts` imported `./src/channel.js`,
`./src/compat.js` and `./src/runtime.js` while no `src/` directory existed in
the tarball, so the `extensions` (source/dev-mode) entry point was
unresolvable as published. With `src/` reconstructed, that entry point now
resolves; the `runtimeExtensions` entry point (`dist/index.js`) was always
complete and internally consistent.

Installed plugins load through `runtimeExtensions`, so this gap affected only
dev/source linking, not normal installed operation.
