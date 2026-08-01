import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { settingsPath } from "./paths";

export type ProviderKind = "deepseek" | "anthropic" | "openai-compatible";
export interface ProviderSettings { kind: ProviderKind; baseUrl: string; model: string; }
export type CredentialScope = "text" | "vision";
export interface VisionSettings {
  activeProvider: ProviderKind;
  providers: Record<ProviderKind, ProviderSettings>;
}
export interface AppSettings {
  activeProvider: ProviderKind;
  providers: Record<ProviderKind, ProviderSettings>;
  vision: VisionSettings;
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
  vision: {
    activeProvider: "deepseek",
    providers: {
      deepseek: { kind: "deepseek", baseUrl: "https://api.deepseek.com", model: "" },
      anthropic: { kind: "anthropic", baseUrl: "https://api.anthropic.com", model: "" },
      "openai-compatible": { kind: "openai-compatible", baseUrl: "", model: "" },
    },
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
    vision: {
      activeProvider: stored.vision?.activeProvider ?? DEFAULTS.vision.activeProvider,
      providers: {
        deepseek: { ...DEFAULTS.vision.providers.deepseek, ...stored.vision?.providers?.deepseek },
        anthropic: { ...DEFAULTS.vision.providers.anthropic, ...stored.vision?.providers?.anthropic },
        "openai-compatible": { ...DEFAULTS.vision.providers["openai-compatible"], ...stored.vision?.providers?.["openai-compatible"] },
      },
    },
    voyageApiKey: stored.voyageApiKey?.trim() || process.env.VOYAGE_API_KEY?.trim() || null,
  };
}

const SERVICE = "Explore Desktop";
async function credentialModule() { try { return await import("keytar"); } catch { return null; } }

export async function getApiKey(kind: ProviderKind, scope: CredentialScope = "text"): Promise<string | null> {
  const envName = kind === "anthropic" ? "ANTHROPIC_API_KEY" : kind === "deepseek" ? "DEEPSEEK_API_KEY" : "OPENAI_API_KEY";
  const visionEnvName = `VISION_${envName}`;
  const envValue = scope === "vision" ? process.env[visionEnvName] : process.env[envName];
  if (envValue?.trim()) return envValue.trim();
  const keytar = await credentialModule();
  if (keytar) {
    const account = `${scope}:${kind}`;
    const saved = (await keytar.default.getPassword(SERVICE, account))?.trim();
    if (saved) return saved;
    if (scope === "text") {
      const legacySaved = (await keytar.default.getPassword(SERVICE, kind))?.trim();
      if (legacySaved) {
        await keytar.default.setPassword(SERVICE, account, legacySaved);
        await keytar.default.deletePassword(SERVICE, kind);
        return legacySaved;
      }
    }
    const legacy = readStored();
    if (kind === "anthropic" && legacy.anthropicApiKey?.trim()) {
      const key = legacy.anthropicApiKey.trim();
      await keytar.default.setPassword(SERVICE, account, key);
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
  vision?: {
    activeProvider?: ProviderKind;
    provider?: Partial<ProviderSettings> & { kind: ProviderKind; apiKey?: string; clearApiKey?: boolean };
  };
  dailyCardLimit?: number;
  maxConcurrent?: number;
}): Promise<void> {
  const current = getSettings();
  if (input.activeProvider) current.activeProvider = input.activeProvider;
  async function saveProvider(
    providerInput: Partial<ProviderSettings> & { kind: ProviderKind; apiKey?: string; clearApiKey?: boolean },
    scope: CredentialScope,
  ) {
    const providers = scope === "vision" ? current.vision.providers : current.providers;
    const { apiKey, clearApiKey, ...provider } = providerInput;
    providers[provider.kind] = { ...providers[provider.kind], ...provider };
    const keytar = await credentialModule();
    if (!keytar && (apiKey || clearApiKey)) throw new Error("Windows 凭据管理器不可用");
    const account = `${scope}:${provider.kind}`;
    if (keytar && clearApiKey) await keytar.default.deletePassword(SERVICE, account);
    if (keytar && apiKey?.trim()) await keytar.default.setPassword(SERVICE, account, apiKey.trim());
  }
  if (input.provider) await saveProvider(input.provider, "text");
  if (input.vision?.activeProvider) current.vision.activeProvider = input.vision.activeProvider;
  if (input.vision?.provider) await saveProvider(input.vision.provider, "vision");
  if (input.dailyCardLimit !== undefined) current.dailyCardLimit = Math.max(1, Math.floor(input.dailyCardLimit));
  if (input.maxConcurrent !== undefined) current.maxConcurrent = Math.min(10, Math.max(1, Math.floor(input.maxConcurrent)));
  writeFileSync(settingsPath(), JSON.stringify(current, null, 2), "utf8");
}

export async function publicSettings() {
  const settings = getSettings();
  const hasApiKey = Object.fromEntries(await Promise.all(
    (["deepseek", "anthropic", "openai-compatible"] as ProviderKind[]).map(async kind => [kind, Boolean(await getApiKey(kind))]),
  ));
  const hasVisionApiKey = Object.fromEntries(await Promise.all(
    (["deepseek", "anthropic", "openai-compatible"] as ProviderKind[]).map(async kind => [kind, Boolean(await getApiKey(kind, "vision"))]),
  ));
  return { ...settings, voyageApiKey: undefined, hasApiKey, hasVisionApiKey };
}
