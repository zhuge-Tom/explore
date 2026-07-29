import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { settingsPath } from "./paths";

export type ProviderKind = "deepseek" | "anthropic" | "openai-compatible";
export interface ProviderSettings { kind: ProviderKind; baseUrl: string; model: string; }
export interface AppSettings {
  activeProvider: ProviderKind;
  providers: Record<ProviderKind, ProviderSettings>;
  voyageApiKey: string | null;
  dailyCardLimit: number;
  maxConcurrent: number;
}

const DEFAULTS: AppSettings = {
  activeProvider: "deepseek",
  providers: {
    deepseek: { kind: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
    anthropic: { kind: "anthropic", baseUrl: "https://api.anthropic.com", model: "" },
    "openai-compatible": { kind: "openai-compatible", baseUrl: "", model: "" },
  },
  voyageApiKey: null,
  dailyCardLimit: 50,
  maxConcurrent: 3,
};

type Stored = Partial<AppSettings> & { anthropicApiKey?: string | null };
function readStored(): Stored {
  try {
    if (!existsSync(settingsPath())) return {};
    return JSON.parse(readFileSync(settingsPath(), "utf8")) as Stored;
  } catch { return {}; }
}

export function getSettings(): AppSettings {
  const stored = readStored();
  return {
    ...DEFAULTS, ...stored,
    providers: {
      deepseek: { ...DEFAULTS.providers.deepseek, ...stored.providers?.deepseek },
      anthropic: { ...DEFAULTS.providers.anthropic, ...stored.providers?.anthropic },
      "openai-compatible": { ...DEFAULTS.providers["openai-compatible"], ...stored.providers?.["openai-compatible"] },
    },
    voyageApiKey: stored.voyageApiKey?.trim() || process.env.VOYAGE_API_KEY?.trim() || null,
  };
}

const SERVICE = "Explore Desktop";
async function credentialModule() { try { return await import("keytar"); } catch { return null; } }

export async function getApiKey(kind: ProviderKind): Promise<string | null> {
  const envName = kind === "anthropic" ? "ANTHROPIC_API_KEY" : kind === "deepseek" ? "DEEPSEEK_API_KEY" : "OPENAI_API_KEY";
  if (process.env[envName]?.trim()) return process.env[envName]!.trim();
  const keytar = await credentialModule();
  if (keytar) {
    const saved = (await keytar.default.getPassword(SERVICE, kind))?.trim();
    if (saved) return saved;
    const legacy = readStored();
    if (kind === "anthropic" && legacy.anthropicApiKey?.trim()) {
      const key = legacy.anthropicApiKey.trim();
      await keytar.default.setPassword(SERVICE, kind, key);
      delete legacy.anthropicApiKey;
      writeFileSync(settingsPath(), JSON.stringify(legacy, null, 2), "utf8");
      return key;
    }
    return null;
  }
  const legacy = readStored();
  return kind === "anthropic" ? legacy.anthropicApiKey?.trim() || null : null;
}

export async function saveSettings(input: {
  activeProvider?: ProviderKind;
  provider?: Partial<ProviderSettings> & { kind: ProviderKind; apiKey?: string; clearApiKey?: boolean };
  dailyCardLimit?: number;
  maxConcurrent?: number;
}): Promise<void> {
  const current = getSettings();
  if (input.activeProvider) current.activeProvider = input.activeProvider;
  if (input.provider) {
    const { apiKey, clearApiKey, ...provider } = input.provider;
    current.providers[provider.kind] = { ...current.providers[provider.kind], ...provider };
    const keytar = await credentialModule();
    if (!keytar && (apiKey || clearApiKey)) throw new Error("Windows 凭据管理器不可用");
    if (keytar && clearApiKey) await keytar.default.deletePassword(SERVICE, provider.kind);
    if (keytar && apiKey?.trim()) await keytar.default.setPassword(SERVICE, provider.kind, apiKey.trim());
  }
  if (input.dailyCardLimit !== undefined) current.dailyCardLimit = Math.max(1, Math.floor(input.dailyCardLimit));
  if (input.maxConcurrent !== undefined) current.maxConcurrent = Math.min(10, Math.max(1, Math.floor(input.maxConcurrent)));
  writeFileSync(settingsPath(), JSON.stringify(current, null, 2), "utf8");
}

export async function publicSettings() {
  const settings = getSettings();
  const hasApiKey = Object.fromEntries(await Promise.all(
    (["deepseek", "anthropic", "openai-compatible"] as ProviderKind[]).map(async kind => [kind, Boolean(await getApiKey(kind))]),
  ));
  return { ...settings, voyageApiKey: undefined, hasApiKey };
}
