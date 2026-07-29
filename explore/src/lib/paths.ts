import { mkdirSync } from "node:fs";
import path from "node:path";

export function dataDir(): string {
  const dir = process.env.EXPLORE_DATA_DIR?.trim() || process.cwd();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function databasePath(): string {
  const dir = path.join(dataDir(), "data");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "explore.db");
}

export function uploadsDir(): string {
  const dir = path.join(dataDir(), "uploads");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function settingsPath(): string {
  return path.join(dataDir(), "settings.json");
}
