import { db } from "./db";
import { getSettings } from "./settings";

export interface LimitCheck {
  ok: boolean;
  reason?: string;
}

/** 并发生成数检查(重新生成也要过这关,但不吃每日配额) */
export async function checkConcurrency(): Promise<LimitCheck> {
  const { maxConcurrent } = getSettings();
  // 只看最近 10 分钟内活跃的 generating:进程崩溃遗留的僵尸卡片不占额度
  const recentWindow = new Date(Date.now() - 10 * 60 * 1000);
  const generatingCount = await db.card.count({
    where: { status: "generating", updatedAt: { gte: recentWindow } },
  });
  if (generatingCount >= maxConcurrent) {
    return {
      ok: false,
      reason: `同时生成的卡片太多(${generatingCount}/${maxConcurrent}),等当前卡片完成后再继续`,
    };
  }
  return { ok: true };
}

/** 创建卡片前的配额检查:每日上限 + 并发生成数 */
export async function checkCardLimits(): Promise<LimitCheck> {
  const { dailyCardLimit } = getSettings();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const todayCount = await db.card.count({
    where: { createdAt: { gte: dayStart } },
  });
  if (todayCount >= dailyCardLimit) {
    return {
      ok: false,
      reason: `已达今日 ${dailyCardLimit} 张卡片上限(可在「⚙️ 设置」中调整)`,
    };
  }
  return checkConcurrency();
}

/** 把底层 SDK 错误翻译成用户能看懂的提示 */
export function friendlyLLMError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/api key|x-api-key|authentication|401/i.test(msg)) {
    return "当前模型渠道尚未配置或 API Key 无效，请打开右上角设置检查配置";
  }
  if (/rate.?limit|429/i.test(msg)) {
    return "触发速率限制,稍等片刻后重试";
  }
  if (/overloaded|529/i.test(msg)) {
    return "模型服务繁忙,稍后重试";
  }
  if (/timeout|timed out/i.test(msg)) {
    return "请求超时,请重试";
  }
  return msg.length > 120 ? "生成失败,请重试" : msg;
}

/** 今日用量聚合(首页看板) */
export async function todayUsage() {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const cards = await db.card.findMany({
    where: { createdAt: { gte: dayStart }, usageJson: { not: null } },
    select: { usageJson: true },
  });
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  for (const c of cards) {
    try {
      const u = JSON.parse(c.usageJson!) as {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
      input += u.input_tokens ?? 0;
      output += u.output_tokens ?? 0;
      cacheRead += u.cache_read_input_tokens ?? 0;
      cacheWrite += u.cache_creation_input_tokens ?? 0;
    } catch {
      /* 忽略坏数据 */
    }
  }
  const totalInput = input + cacheRead + cacheWrite;
  // 不同渠道价格不同，仅展示 token；费用由服务商控制台为准。
  const costUSD = 0;
  return {
    cards: cards.length,
    totalInput,
    output,
    cachePct: totalInput > 0 ? Math.round((cacheRead / totalInput) * 100) : 0,
    costUSD: Math.round(costUSD * 100) / 100,
    limit: getSettings().dailyCardLimit,
  };
}
