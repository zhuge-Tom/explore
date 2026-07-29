import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getApiKey, getSettings, type ProviderKind, type ProviderSettings } from "../settings";
import { SYSTEM_PROMPT, DIGEST_PROMPT, REVIEW_SYSTEM, type ReviewResult, buildInstruction, buildBranchContext, type InstructionInput } from "./prompts";

export interface ProviderErrorShape { code: "not_configured"|"authentication"|"permission"|"rate_limit"|"model_unavailable"|"network"|"server"; message: string; }
export class ProviderError extends Error { constructor(public info: ProviderErrorShape) { super(info.message); } }

function classify(e: unknown): ProviderError {
  const message = e instanceof Error ? e.message : String(e);
  if (/401|authentication|invalid.*key|api.?key/i.test(message)) return new ProviderError({ code: "authentication", message: "API Key 无效或认证失败" });
  if (/403|permission|forbidden/i.test(message)) return new ProviderError({ code: "permission", message: "API Key 没有所选模型的访问权限" });
  if (/404|model.*not|not.*found/i.test(message)) return new ProviderError({ code: "model_unavailable", message: "所选模型不存在或当前账号不可用" });
  if (/429|rate.?limit|quota|balance/i.test(message)) return new ProviderError({ code: "rate_limit", message: "额度不足或触发速率限制" });
  if (/timeout|timed out|fetch failed|connection|network/i.test(message)) return new ProviderError({ code: "network", message: "无法连接模型服务，请检查网络和 API 地址" });
  return new ProviderError({ code: "server", message: message.slice(0, 180) || "模型服务异常" });
}

async function active() {
  const settings = getSettings();
  const config = settings.providers[settings.activeProvider];
  const apiKey = await getApiKey(settings.activeProvider);
  if (!apiKey) throw new ProviderError({ code: "not_configured", message: "尚未配置当前模型渠道的 API Key" });
  if (!config.model) throw new ProviderError({ code: "model_unavailable", message: "尚未选择模型" });
  return { config, apiKey };
}

function openAIClient(config: ProviderSettings, apiKey: string) {
  return new OpenAI({ apiKey, baseURL: config.baseUrl.replace(/\/$/, ""), timeout: 30000, maxRetries: 0 });
}

export async function listModels(input: { kind: ProviderKind; baseUrl: string; apiKey?: string }): Promise<string[]> {
  const key = input.apiKey?.trim() || await getApiKey(input.kind);
  if (!key) throw new ProviderError({ code: "not_configured", message: "请先输入 API Key" });
  try {
    if (input.kind === "anthropic") {
      const response = await new Anthropic({ apiKey: key, baseURL: input.baseUrl || undefined, maxRetries: 0 }).models.list({ limit: 100 });
      return response.data.map(model => model.id).sort();
    }
    const response = await openAIClient({ kind: input.kind, baseUrl: input.baseUrl, model: "" }, key).models.list();
    const models: string[] = [];
    for await (const model of response) models.push(model.id);
    return models.sort();
  } catch (e) { throw classify(e); }
}

export async function testConnection(input: { kind: ProviderKind; baseUrl: string; apiKey?: string; model?: string }) {
  const models = await listModels(input);
  if (input.model && !models.includes(input.model)) throw new ProviderError({ code: "model_unavailable", message: "所选模型不在当前账号的可用模型列表中" });
  return models;
}

interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; }
interface FinalMessage { content: string; stop_reason: string | null; usage: Usage; }
class UnifiedStream {
  private listeners: Array<(text: string) => void> = [];
  constructor(private run: (emit: (text: string) => void) => Promise<FinalMessage>) {}
  on(event: "text", listener: (text: string) => void) { if (event === "text") this.listeners.push(listener); return this; }
  finalMessage() { return this.run(text => this.listeners.forEach(listener => listener(text))); }
}

async function streamWithProvider(system: string, user: string): Promise<UnifiedStream> {
  const { config, apiKey } = await active();
  if (config.kind === "anthropic") {
    return new UnifiedStream(async emit => {
      try {
        const stream = new Anthropic({ apiKey, baseURL: config.baseUrl || undefined }).messages.stream({ model: config.model, max_tokens: 8000, system, messages: [{ role: "user", content: user }] });
        stream.on("text", emit);
        const final = await stream.finalMessage();
        const content = final.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("");
        return { content, stop_reason: final.stop_reason, usage: { input_tokens: final.usage.input_tokens, output_tokens: final.usage.output_tokens, cache_read_input_tokens: final.usage.cache_read_input_tokens ?? 0, cache_creation_input_tokens: final.usage.cache_creation_input_tokens ?? 0 } };
      } catch (e) { throw classify(e); }
    });
  }
  return new UnifiedStream(async emit => {
    try {
      const response = await openAIClient(config, apiKey).chat.completions.create({ model: config.model, max_tokens: 8000, stream: true, stream_options: { include_usage: true }, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
      let content = ""; let input = 0; let output = 0; let reason: string | null = null;
      for await (const chunk of response) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) { content += text; emit(text); }
        reason = chunk.choices[0]?.finish_reason || reason;
        input = chunk.usage?.prompt_tokens || input; output = chunk.usage?.completion_tokens || output;
      }
      return { content, stop_reason: reason, usage: { input_tokens: input, output_tokens: output } };
    } catch (e) { throw classify(e); }
  });
}

export interface StreamCardInput { instruction: InstructionInput; branch?: { ancestorDigest: string | null; parentTitle: string; parentContent: string; }; documentText?: string | null; }
export async function streamCard(input: StreamCardInput) {
  const sections: string[] = [];
  if (input.documentText) sections.push(`# 文档内容\n${input.documentText}\n\n引用文档时请在对应陈述后保留 [[page:N]] 页码标记。`);
  if (input.branch) sections.push(buildBranchContext(input.branch.ancestorDigest, input.branch.parentTitle, input.branch.parentContent));
  sections.push(buildInstruction(input.instruction));
  return streamWithProvider(SYSTEM_PROMPT, sections.join("\n\n"));
}

async function complete(system: string, user: string, maxTokens = 2000): Promise<string> {
  const { config, apiKey } = await active();
  try {
    if (config.kind === "anthropic") {
      const res = await new Anthropic({ apiKey, baseURL: config.baseUrl || undefined }).messages.create({ model: config.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
      return res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("").trim();
    }
    const res = await openAIClient(config, apiKey).chat.completions.create({ model: config.model, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
    return res.choices[0]?.message.content?.trim() || "";
  } catch (e) { throw classify(e); }
}

export async function compressDigest(parentDigest: string | null, parentTitle: string, parentContent: string): Promise<string | null> {
  try { return await complete(DIGEST_PROMPT, `${parentDigest ? `已有摘要：${parentDigest}\n\n` : ""}${parentTitle}\n${parentContent}`); } catch { return null; }
}

export async function reviewSummary(cardTitle: string, cardContent: string, userSummary: string): Promise<ReviewResult | null> {
  try {
    const text = await complete(`${REVIEW_SYSTEM}\n只输出 JSON，不要 Markdown。`, `卡片：${cardTitle}\n${cardContent}\n\n用户总结：${userSummary}`, 3000);
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const parsed = JSON.parse(json) as ReviewResult;
    return typeof parsed.accuracy === "number" && typeof parsed.passed === "boolean" ? parsed : null;
  } catch { return null; }
}

export async function embed(texts: string[]): Promise<number[][] | null> {
  const key = getSettings().voyageApiKey;
  if (!key || !texts.length) return null;
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: "voyage-3", input: texts }) });
    if (!res.ok) return null;
    const data = await res.json() as { data: { index: number; embedding: number[] }[] };
    return data.data.sort((a,b) => a.index-b.index).map(item => item.embedding);
  } catch { return null; }
}

export { classify as normalizeProviderError };
