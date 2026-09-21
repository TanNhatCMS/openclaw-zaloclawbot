#!/usr/bin/env node
/**
 * One-shot install for @TanNhatCMS/openclaw-zaloclawbot.
 *
 * Runs the openclaw plugins install + enable + restart + login sequence.
 *
 * Usage:
 *   npx -y @TanNhatCMS/openclaw-zaloclawbot-cli install
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PKG = "@TanNhatCMS/openclaw-zaloclawbot";
const CHANNEL = "openclaw-zaloclawbot";

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function candidateOpenClawBins(dir) {
  if (process.platform === "win32") {
    return ["openclaw.cmd", "openclaw.exe", "openclaw"].map((name) => path.join(dir, name));
  }
  return [path.join(dir, "openclaw")];
}

function resolveHostOpenClawBin() {
  const override = normalizeEnvPath(process.env.OPENCLAW_BIN);
  if (override) {
    if (isExecutable(override)) return override;
    throw new Error(`OPENCLAW_BIN is not executable: ${override}`);
  }

  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const resolvedDir = path.resolve(dir);
    // npm/npx prepends local node_modules/.bin entries. Those can point at this
    // plugin workspace's devDependency instead of the user's host OpenClaw.
    if (resolvedDir.includes(`${path.sep}node_modules${path.sep}.bin`)) continue;

    const found = candidateOpenClawBins(resolvedDir).find(isExecutable);
    if (found) return found;
  }

  return undefined;
}

function normalizeEnvPath(value) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
  if (trimmed === "~" || trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.resolve(trimmed.replace(/^~(?=$|[\\/])/, os.homedir()));
  }
  return path.resolve(trimmed);
}

function resolveOpenClawStateDir() {
  const stateOverride = normalizeEnvPath(process.env.OPENCLAW_STATE_DIR);
  if (stateOverride) return stateOverride;
  const openclawHome = normalizeEnvPath(process.env.OPENCLAW_HOME);
  return path.join(openclawHome ?? os.homedir(), ".openclaw");
}

function readInstalledPluginVersion(openclawBin) {
  // Ask the host for the installed version so we can branch skip/upgrade/install
  // without `--force` on the install step (`--force` bypasses the catalog
  // integrity check; a plain `plugins install <pkg>@<version>` is verified).
  // We query the host rather than read a fixed path because managed installs
  // live under npm/projects/<hash>/node_modules, not a predictable location.
  const probe = spawnSync(openclawBin, ["plugins", "list", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (probe.status !== 0) return null;
  try {
    // Tolerate a leading banner line before the JSON payload on stdout.
    const out = probe.stdout ?? "";
    const start = out.indexOf("{");
    const data = JSON.parse(start >= 0 ? out.slice(start) : out);
    const plugins = Array.isArray(data) ? data : data?.plugins;
    const entry = plugins?.find((p) => p.id === CHANNEL || p.name === PKG);
    return entry?.version ?? null;
  } catch {
    return null;
  }
}

function ensureLegacyChannelCatalogLink() {
  // OpenClaw 2026.5.3 and older discover third-party channels from
  // ~/.openclaw/extensions; newer hosts use the managed install record.
  // The symlink is harmless on newer hosts and keeps older ones working.
  const stateDir = resolveOpenClawStateDir();
  const managedPackageDir = path.join(stateDir, "npm", "node_modules", ...PKG.split("/"));
  const extensionsDir = path.join(stateDir, "extensions");
  const linkPath = path.join(extensionsDir, CHANNEL);

  if (!fs.existsSync(managedPackageDir)) {
    if (fs.existsSync(path.join(linkPath, "package.json"))) {
      console.log(`[${PKG}-cli] plugin is already available in ${extensionsDir}`);
      return;
    }
    console.warn(
      `[${PKG}-cli] plugin package not found at ${managedPackageDir}; skipping compatibility link`,
    );
    return;
  }

  fs.mkdirSync(extensionsDir, { recursive: true });

  try {
    const existing = fs.lstatSync(linkPath);
    if (!existing.isSymbolicLink()) {
      console.warn(`[${PKG}-cli] ${linkPath} exists and is not a symlink; leaving it unchanged`);
      return;
    }

    let currentTarget;
    try {
      currentTarget = fs.realpathSync(linkPath);
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
      fs.unlinkSync(linkPath);
      currentTarget = undefined;
    }
    const expectedTarget = fs.realpathSync(managedPackageDir);
    if (currentTarget === expectedTarget) return;
    if (currentTarget) fs.unlinkSync(linkPath);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }

  fs.symlinkSync(managedPackageDir, linkPath, process.platform === "win32" ? "junction" : "dir");
  console.log(`[${PKG}-cli] linked ${linkPath} -> ${managedPackageDir}`);
}

function run(cmd, args, { allowFail = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", (err) => {
      if (allowFail) resolve({ code: 127 });
      else reject(err);
    });
    child.on("exit", (code) => {
      if (code === 0 || allowFail) resolve({ code });
      else reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function resolvePluginSpec() {
  const override = process.env.ZALOCLAWBOT_PLUGIN_SPEC?.trim();
  if (override) return override;

  // OpenClaw rejects @latest when the dist-tag resolves to a prerelease, but it
  // accepts the same prerelease when passed as an exact version. Resolve latest
  // here so fresh installs follow npm latest without hardcoding a plugin build.
  const probe = spawnSync("npm", ["view", `${PKG}@latest`, "version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (probe.status !== 0) {
    const detail = (probe.stderr || probe.stdout || "").trim();
    throw new Error(
      `failed to resolve ${PKG}@latest${detail ? `: ${detail.split("\n")[0]}` : ""}`,
    );
  }

  const version = probe.stdout.trim().split(/\s+/).at(-1);
  if (!version) throw new Error(`failed to resolve ${PKG}@latest: empty npm response`);
  return `${PKG}@${version}`;
}

async function main() {
  const subcommand = process.argv[2] ?? "install";
  if (subcommand !== "install") {
    console.error(`Unknown subcommand: ${subcommand}. Supported: install`);
    process.exit(2);
  }

  let openclawBin;
  try {
    openclawBin = resolveHostOpenClawBin();
  } catch (err) {
    console.error(`[${PKG}-cli] setup failed:`, err.message);
    process.exit(1);
  }

  if (!openclawBin) {
    console.error(
      [
        "",
        `${PKG}-cli: \`openclaw\` is not on PATH.`,
        "",
        "Install it first:",
        "  npm install -g openclaw@latest",
        "  openclaw onboard --install-daemon",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  console.log(`[${PKG}-cli] using OpenClaw CLI: ${openclawBin}`);
  await run(openclawBin, ["--version"]);

  const pluginSpec = resolvePluginSpec();
  const targetVersion = pluginSpec.slice(PKG.length + 1);
  const installedVersion = readInstalledPluginVersion(openclawBin);

  if (installedVersion === targetVersion) {
    console.log(`[${PKG}-cli] plugin already at ${targetVersion}; skipping install.`);
  } else {
    if (installedVersion) {
      // Upgrade path: `plugins install` refuses to replace an existing install,
      // and `plugins update` keeps the tracked pin (won't move 0.1.0 -> latest).
      // Remove first, then install fresh. `uninstall --force` only skips the
      // interactive confirmation prompt; it does not touch the plugin's
      // state-dir credentials, so the QR login survives the reinstall.
      console.log(`[${PKG}-cli] replacing installed ${installedVersion} with ${targetVersion}...`);
      await run(openclawBin, ["plugins", "uninstall", CHANNEL, "--force"], { allowFail: true });
    } else {
      console.log(`[${PKG}-cli] registering plugin (${pluginSpec})...`);
    }
    // No `--force` on install: this is the integrity-verified catalog path.
    const { code } = await run(openclawBin, ["plugins", "install", pluginSpec], {
      allowFail: true,
    });
    if (code !== 0) {
      // An existing install we couldn't detect blocked the clean install; clear
      // it prompt-free and install the pinned version through the verified path.
      console.log(`[${PKG}-cli] install returned ${code}; clearing existing install and retrying...`);
      await run(openclawBin, ["plugins", "uninstall", CHANNEL, "--force"], { allowFail: true });
      await run(openclawBin, ["plugins", "install", pluginSpec]);
    }
  }
  ensureLegacyChannelCatalogLink();

  console.log(`[${PKG}-cli] enabling plugin in config...`);
  await run(
    openclawBin,
    ["config", "set", `plugins.entries.${CHANNEL}.enabled`, "true"],
    { allowFail: true },
  );

  console.log(`[${PKG}-cli] restarting openclaw gateway...`);
  await run(openclawBin, ["gateway", "restart"]);

  console.log(`[${PKG}-cli] launching QR login...\n`);
  const { code } = await run(
    openclawBin,
    ["channels", "login", "--channel", CHANNEL],
    { allowFail: true },
  );
  process.exit(code ?? 0);
}

main().catch((err) => {
  console.error(`[${PKG}-cli] setup failed:`, err.message);
  process.exit(1);
});
