// LLM Gateway —— 全项目唯一接触 Anthropic SDK 的模块。
// 职责:Prompt 组装、缓存断点、流式调用、refusal 兜底、评审、摘要压缩、嵌入。

import Anthropic from "@anthropic-ai/sdk";
import { getSettings } from "../settings";
import {
  SYSTEM_PROMPT,
  DIGEST_PROMPT,
  REVIEW_SYSTEM,
  REVIEW_SCHEMA,
  type ReviewResult,
  buildInstruction,
  buildBranchContext,
  type InstructionInput,
} from "./prompts";

export const MODEL = "claude-opus-5";

let _client: Anthropic | null = null;
let _clientKey: string | null = null;
function client(): Anthropic {
  // 运行时读取配置(页面设置 > 环境变量);Key 变更时重建客户端,即改即生效
  const key = getSettings().anthropicApiKey;
  if (!key) {
    throw new Error("未配置 API Key:请在首页「⚙️ 设置」中填入 ANTHROPIC_API_KEY");
  }
  if (!_client || _clientKey !== key) {
    _client = new Anthropic({ apiKey: key });
    _clientKey = key;
  }
  return _client;
}

/** 用给定 Key 验证连通性(设置面板的「测试连接」)。返回 null = 成功,否则返回错误信息 */
export async function testApiKey(key: string): Promise<string | null> {
  try {
    const c = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 15000 });
    await c.models.retrieve(MODEL);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/401|authentication/i.test(msg)) return "Key 无效(认证失败)";
    if (/403|permission/i.test(msg)) return "Key 有效但没有权限";
    if (/timeout|timed out|connection/i.test(msg)) return "网络不通,无法连接 Anthropic API";
    return msg.slice(0, 160);
  }
}

export interface StreamCardInput {
  instruction: InstructionInput;
  branch?: {
    ancestorDigest: string | null;
    parentTitle: string;
    parentContent: string;
  };
  /** 文献树:Anthropic Files API 的 file_id */
  documentFileId?: string | null;
}

/**
 * 流式生成一张卡片。
 * 缓存分层(前缀匹配,稳定 → 易变):
 *   ① system 系统提示词(1h)
 *   ② 文献 document block(1h,citations 开启)
 *   ③ 分支上下文:祖先摘要 + 父卡片全文(5m)
 *   ④ 本次指令(不缓存)
 */
export function streamCard(input: StreamCardInput) {
  const content: unknown[] = [];

  if (input.documentFileId) {
    content.push({
      type: "document",
      source: { type: "file", file_id: input.documentFileId },
      citations: { enabled: true },
      cache_control: { type: "ephemeral", ttl: "1h" },
    });
  }
  if (input.branch) {
    content.push({
      type: "text",
      text: buildBranchContext(
        input.branch.ancestorDigest,
        input.branch.parentTitle,
        input.branch.parentContent,
      ),
      cache_control: { type: "ephemeral" },
    });
  }
  content.push({ type: "text", text: buildInstruction(input.instruction) });

  const betas = ["server-side-fallback-2026-07-01"];
  if (input.documentFileId) betas.push("files-api-2025-04-14");

  // Opus 5:思考默认开启(不传 thinking);不传 temperature/top_p/top_k。
  // fallbacks: "default" —— 安全分类器拒答时服务端自动换推荐兜底模型。
  // as never:fallbacks/output_config 等较新字段在当前 SDK 类型里可能缺失,运行时透传有效。
  return client().beta.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    betas,
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    messages: [{ role: "user", content }],
  } as never);
}

/**
 * 压缩祖先链摘要:digest(child) = compress(digest(parent) + parent.content)。
 * 低 effort、非流式;失败返回 null(降级为无摘要,不阻塞主链路)。
 */
export async function compressDigest(
  parentDigest: string | null,
  parentTitle: string,
  parentContent: string,
): Promise<string | null> {
  try {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: `${DIGEST_PROMPT}\n\n${parentDigest ? `# 既有路径摘要\n${parentDigest}\n\n` : ""}# 新增一层:《${parentTitle}》\n${parentContent}`,
        },
      ],
    } as never);

    if (res.stop_reason === "refusal") return null;
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch {
    return null;
  }
}

/**
 * 思维宇宙总结评审:结构化输出(json_schema),effort high。
 * 返回 null 表示评审系统异常(调用方按"稍后重试"降级)。
 */
export async function reviewSummary(
  cardTitle: string,
  cardContent: string,
  userSummary: string,
): Promise<ReviewResult | null> {
  try {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: REVIEW_SCHEMA },
      },
      system: REVIEW_SYSTEM,
      messages: [
        {
          role: "user",
          content: `# 卡片《${cardTitle}》原文\n${cardContent}\n\n# 用户的总结\n${userSummary}`,
        },
      ],
    } as never);

    if (res.stop_reason === "refusal") return null;
    const text = res.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    )?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as ReviewResult;
    if (
      typeof parsed.accuracy !== "number" ||
      typeof parsed.passed !== "boolean"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Voyage AI 文本嵌入(思维宇宙语义连线 + 知识锚点检索)。
 * 未配置 VOYAGE_API_KEY 时静默返回 null(全部功能降级可用)。
 */
export async function embed(texts: string[]): Promise<number[][] | null> {
  const key = getSettings().voyageApiKey;
  if (!key || texts.length === 0) return null;
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model: "voyage-3", input: texts }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data: { index: number; embedding: number[] }[];
    };
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  } catch {
    return null;
  }
}

export type { Anthropic };
