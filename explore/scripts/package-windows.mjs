import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const builder = path.resolve("node_modules/electron-builder/out/cli/cli.js");
const prepackaged = path.resolve("dist/win-unpacked");
const nsisOutput = path.join(os.tmpdir(), "explore-nsis-build");

function run(args) {
  const result = spawnSync(process.execPath, [builder, ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (existsSync(prepackaged)) {
  // Refresh the already validated Electron runtime without asking exFAT to
  // atomically rename a 1 GB directory (an operation it intermittently rejects).
  await cp(".next/standalone", path.join(prepackaged, "resources/app/.next/standalone"), { recursive: true, force: true });
  await cp("electron/main.cjs", path.join(prepackaged, "resources/app/electron/main.cjs"), { force: true });
  await cp("package.json", path.join(prepackaged, "resources/app/package.json"), { force: true });
  await cp("desktop-assets/explore-empty.db", path.join(prepackaged, "resources/seed/explore.db"), { force: true });
} else {
  // Clean checkouts use the normal Builder staging path. On exFAT, keeping a
  // previously built win-unpacked directory makes later builds more reliable.
  run(["--dir", "--win", "--x64", "--config.directories.output", path.resolve("dist")]);
}

await rm(nsisOutput, { recursive: true, force: true });
await mkdir(nsisOutput, { recursive: true });
run(["--win", "nsis", "--x64", "--prepackaged", prepackaged, "--config.directories.output", nsisOutput]);
await cp(path.join(nsisOutput, "Explore Setup 0.1.0.exe"), path.resolve("dist/Explore Setup 0.1.0.exe"), { force: true });
