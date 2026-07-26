// 运行时配置:保存于 settings.local.json(gitignored),改动即时生效,无需重启。
// 优先级:settings.local.json > 环境变量(.env)。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "settings.local.json");

export interface AppSettings {
  anthropicApiKey: string | null;
  voyageApiKey: string | null;
  dailyCardLimit: number;
  maxConcurrent: number;
}

const DEFAULTS = {
  dailyCardLimit: 50,
  maxConcurrent: 3,
};

function readFile(): Partial<AppSettings> {
  try {
    if (!existsSync(FILE)) return {};
    return JSON.parse(readFileSync(FILE, "utf8")) as Partial<AppSettings>;
  } catch {
    return {};
  }
}

export function getSettings(): AppSettings {
  const f = readFile();
  return {
    anthropicApiKey:
      f.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || null,
    voyageApiKey:
      f.voyageApiKey?.trim() || process.env.VOYAGE_API_KEY?.trim() || null,
    dailyCardLimit:
      Number(f.dailyCardLimit) ||
      Number(process.env.DAILY_CARD_LIMIT) ||
      DEFAULTS.dailyCardLimit,
    maxConcurrent:
      Number(f.maxConcurrent) ||
      Number(process.env.MAX_CONCURRENT_GENERATIONS) ||
      DEFAULTS.maxConcurrent,
  };
}

export function saveSettings(patch: {
  anthropicApiKey?: string | null;
  voyageApiKey?: string | null;
  dailyCardLimit?: number;
  maxConcurrent?: number;
}): void {
  const current = readFile();
  const next = { ...current };
  // undefined = 不改;空字符串/null = 清除(回退到环境变量)
  if (patch.anthropicApiKey !== undefined) {
    next.anthropicApiKey = patch.anthropicApiKey?.trim() || null;
  }
  if (patch.voyageApiKey !== undefined) {
    next.voyageApiKey = patch.voyageApiKey?.trim() || null;
  }
  if (patch.dailyCardLimit !== undefined) {
    next.dailyCardLimit = Math.max(1, Math.floor(patch.dailyCardLimit)) || DEFAULTS.dailyCardLimit;
  }
  if (patch.maxConcurrent !== undefined) {
    next.maxConcurrent = Math.min(10, Math.max(1, Math.floor(patch.maxConcurrent))) || DEFAULTS.maxConcurrent;
  }
  writeFileSync(FILE, JSON.stringify(next, null, 2), "utf8");
}

/** 只暴露掩码,完整 Key 永不回传前端 */
export function maskKey(key: string | null): string | null {
  if (!key) return null;
  return key.length > 8 ? `${key.slice(0, 7)}…${key.slice(-4)}` : "已配置";
}
