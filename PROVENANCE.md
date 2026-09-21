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

Committed here:

- `src/` — TypeScript sources reconstructed from the published `dist/` (see below).
- `index.ts`, `openclaw.plugin.json`, `package.json`, `README.md`, `LICENSE` —
  exactly as published.

`dist/` is **not** committed: it is build output, produced by `npm run build`
(`tsc`), and ignored via `.gitignore`.

## Reconstruction of `src/`

`src/**/*.ts` was written by hand from the published `dist/**/*.js`, with types
taken from the real `openclaw` plugin SDK (`openclaw@2026.5.18`, the version the
package pins as a devDependency) rather than invented.

The reconstruction is verified, not asserted:

```sh
npm install
npx tsc --noEmit   # typecheck: clean
npm run build      # emits dist/
```

Compiling `src/` reproduces **all 19 published `dist/**/*.js` files
byte-for-byte identical** to the tarball output. `tsconfig.json` mirrors the
compiler settings implied by the published output (NodeNext ESM, ES2023 target,
`outDir: dist`, `rootDir: .`).

Type-only imports and annotations are erased at compile time, so they do not
affect the emitted JavaScript. Where the emitted shape would otherwise drift
(parameter destructuring, parenthesization, import specifier grouping), the source
is written to match the published output exactly.

### Verifying the reconstruction

The SHA-256 of each file as published in the tarball is recorded below. After
`npm run build`, compare `dist/` against this list — every entry must match.

```
0165a9022f28aa871e9a7a6e35b30f3dad19c5064109045b860bdc748adb7e86  ./index.js
46b023b907bfc632941de0a1dbff322f643089117e6376da80aa4b102530b9bb  ./src/api/api.js
0fd772d12675212206f7448e083e402ba03bbefaaa206122a4208618e97a7beb  ./src/auth/accounts.js
13dd9264897b04198ed80e6894d41c9feaf087ba26c68e8940ed40fd46d4c173  ./src/auth/login-account.js
28af2cfda027824e4f141ed6bc7381dee373d2298a645d90fad176d2c3d17890  ./src/auth/login-flow.js
ee5301748aa5542105f82291157adca12b9344cd1bdb2bbe372f05aab81bbd5e  ./src/auth/login-qr.js
77f9d6dfec16a5962f1b667349e3730cbb5d79fb608377d1545c0875331d67f9  ./src/channel.js
0233d84c62496184b012b95803713cda968c32bbfe50c0fd41e3223caef7f00e  ./src/compat.js
1423ecd6634fdbb0bf46048bb65d5a4e49f5bd77ec4ab7c715b70e16eeb1a6c1  ./src/messaging/inbound.js
b66e16bf788c66efdd21469378d6ead7b3e9c01ebc6357c69c0b1b41d8f1be77  ./src/messaging/send.js
c425a14a3333c7157dd75135d307caa0872875f2e9f73fbcf3a4618be9de86e5  ./src/monitor/dedupe.js
8ba45313e9da36be3cbf43d82db383c84f9ab9f54b1e74acf28d18ca54085aea  ./src/monitor/monitor.js
36e913a671e27a5e3fb6e33916e0bb848e65a08011aaaf02cae44e1a9661cb70  ./src/monitor/process-message.js
02384e42c5e1782092cb266d1d6d4415e29b390ae08bc1ba914c9e7e990fceaa  ./src/runtime.js
31af4297ec3706478061b3af9bac8f0b0481538783a41b15143de89619849491  ./src/session-route.js
aa8313826dbc57635c6d4815ea58f4a15bf9a027ae1d5b0c183fa6ef9555f913  ./src/setup/onboarding.js
7bc19f0f401917e111dffb51feca39c70e788040c91505395ce3ca2b44e9c267  ./src/storage/state-dir.js
65888081c33b24ad554b6df454b3b4ef084c47e29425f27a78314440cb4c7199  ./src/util/logger.js
afdaea6ed47c83af0daf65743512d448c896d21e3fb6dec4da00e427763c7467  ./src/webhook/webhook.js
```

## Known gap in the published package

`package.json` declares both entry points:

```json
"openclaw": {
  "extensions": ["./index.ts"],
  "runtimeExtensions": ["./dist/index.js"]
}
```

As published, `index.ts` imports `./src/channel.js`, `./src/compat.js` and
`./src/runtime.js` while no `src/` directory existed in the tarball, so the
`extensions` (source/dev-mode) entry point was unresolvable. With `src/`
reconstructed, that entry point now resolves; the `runtimeExtensions` entry
point (`dist/index.js`) was always complete and internally consistent.

Installed plugins load through `runtimeExtensions`, so this gap affected only
dev/source linking, not normal installed operation.

## Note on installing from git

`dist/` is build output and is not committed. Installing directly from this git
repository (rather than from npm) requires building first:

```sh
npm install && npm run build
```

`npm install` from the npm registry is unaffected: the package's
`prepublishOnly` script builds `dist/` before packing.
