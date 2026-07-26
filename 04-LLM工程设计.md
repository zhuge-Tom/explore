# 04 · LLM 工程设计

> 本文档是 LLM Gateway 模块的实现规范。所有代码示例为 TypeScript(`@anthropic-ai/sdk`)。

## 1. 模型选型

| 用途 | 模型 | 配置 |
|---|---|---|
| 卡片生成(主链路) | `claude-opus-5` | 自适应思考(默认开启,无需传 `thinking`)+ `output_config.effort: "medium"`,流式 |
| 总结评审(思维宇宙) | `claude-opus-5` | `messages.parse` 结构化输出,`effort: "high"`(评审公正性 > 延迟) |
| 祖先链摘要压缩 | `claude-opus-5` | `effort: "low"`,非流式,max_tokens 512 |

要点:

- **Claude Opus 5 思考默认开启**(省略 `thinking` 参数即为 adaptive);不要传 `thinking: {type:"disabled"}` —— 关思考会带来"工具调用写进正文"与 `<thinking>` 标签泄漏两类故障,官方建议用低 effort 控制成本而不是关思考。
- **不传 `temperature` / `top_p` / `top_k`**(Opus 5 已移除,传了直接 400)。风格用 Prompt 控制。
- `max_tokens`:卡片生成流式 8000(卡片正文目标 300–600 字,留足思考空间);评审 4000。
- **refusal 兜底默认开启**:Opus 5 的安全分类器可能拒答(HTTP 200 + `stop_reason:"refusal"`)。网关统一加 server-side fallbacks:

```ts
const response = await client.beta.messages.stream({
  model: "claude-opus-5",
  max_tokens: 8000,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",          // 按拒答类别自动路由到推荐兜底模型
  system: systemBlocks,
  messages,
});
```

读取端**必须先判 `stop_reason` 再取 `content`**;最终仍为 refusal 时卡片置为 `refused` 态。

## 2. 卡片生成:流式 + 术语标记

### 2.1 为什么不用结构化输出生成卡片

结构化 JSON 与流式渐进渲染冲突(JSON 未闭合前无法安全展示)。方案:**正文即协议** —— 让模型在 Markdown 里用双括号标记术语:

```
波函数需要生活在一个 [[希尔伯特空间|带内积结构的完备向量空间]] 中……
```

前端流式解析 `[[术语|一句话预览]]`,渲染为可点击高亮 + 悬停预览。流结束后模型在末尾输出一行 `<!--terms:[...]-->` 注释(或由服务端正则汇总)写入 `cards.terms` 做校准。简单、可流式、协议自愈(漏标只是少个高亮,不会坏)。

### 2.2 系统提示词(骨架)

```
你是 Explore 的知识卡片生成引擎。用户通过点击术语逐层深入学习,
你每次只生成一张卡片。

# 卡片规范
- 长度 300–600 字,Markdown;先一句话定义,再展开,必要时给一个直观类比。
- 在正文中用 [[术语|不超过20字的一句话预览]] 标记 3–8 个值得深入的术语。
  只标记:理解本卡片所必需、且值得单独展开的概念。不标记人名、常识词。
- 已出现在「已有卡片列表」中的术语用 [[术语]] 简写(无预览)。
- 不要重复祖先卡片已经讲透的内容,默认读者已读过面包屑路径上的所有卡片。

# 语气
面向聪明但非本领域的学习者;严谨优先,不堆砌术语。
```

### 2.3 请求组装与 Prompt 缓存(核心成本设计)

缓存是前缀匹配,组装顺序按「稳定 → 易变」严格分层,断点(≤4 个)打在稳定层末尾:

```
┌──────────────────────────────────────────────┐
│ ① system: 系统提示词(全局字节级冻结)         │ ← cache_control ttl:1h
├──────────────────────────────────────────────┤
│ ② user: 文献全文 document block(若该树关联文献)│ ← cache_control ttl:1h
├──────────────────────────────────────────────┤
│ ③ user: 分支上下文                            │
│    - 祖先链摘要(ancestor_digest,冻结文本)    │
│    - 父卡片全文                                │ ← cache_control (5m)
├──────────────────────────────────────────────┤
│ ④ user: 本次指令(易变,不缓存)               │
│    - 卡片类型指令(子/关联/分支)               │
│    - 点击的术语 / 用户问题                     │
│    - 已有卡片标题列表(去重提示)               │
│    - 知识锚点注入段(思维宇宙,若有)           │
└──────────────────────────────────────────────┘
```

- 同一分支上的连续深挖(最常见行为)命中 ①②③,**只为 ④ 的几百 token 付全价**;
- Opus 5 最小可缓存前缀 512 token,系统提示词 + 文献轻松达标;③ 层若不足 512 token 不打断点(打了也不生效,无害但浪费);
- **禁止在 ①–③ 出现任何时间戳、UUID、非确定序列化**(缓存静默失效的头号原因);
- 验证:上线前断言重复请求的 `usage.cache_read_input_tokens > 0`,并把 usage 落库监控命中率。

### 2.4 流式实现

```ts
const stream = client.beta.messages.stream({ /* 上文参数 */ });

stream.on("text", (delta) => sse.send("delta", { text: delta }));

const final = await stream.finalMessage();   // 不要自己包 Promise
if (final.stop_reason === "refusal") {
  sse.send("refused", { message: "该内容无法生成" });
} else {
  const contentMd = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text).join("");
  await cardRepo.complete(cardId, contentMd, parseTerms(contentMd), final.usage);
  sse.send("done", { cardId, usage: final.usage });
}
```

## 3. 上下文继承:祖先链摘要

**问题**:树深 10 层时,把 10 张卡片全文塞进上下文既贵又稀释注意力。

**方案**:每张卡片持久化一份 `ancestor_digest`(≤400 token),生成子卡片时上下文 = `digest(父) + 父卡片全文`。摘要在**子卡片生成成功后异步更新**,不阻塞主链路:

```
digest(child) = compress( digest(parent) + parent.content )
```

压缩 Prompt(`effort: "low"`):

```
把以下学习路径压缩为不超过 300 字的摘要,保留:各层核心概念、
它们之间的推导/包含关系、用户当前的学习意图。丢弃:例子、修辞。
```

分支卡片(branch)继承同样的 digest;关联卡片额外附上被对比卡片的全文。

## 4. 总结评审:结构化输出

用 `messages.parse` + Zod,保证评审结果可靠可解析:

```ts
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const ReviewSchema = z.object({
  accuracy: z.number().int().min(0).max(10),      // 准确性
  completeness: z.number().int().min(0).max(10),  // 抓住要点程度
  own_words: z.boolean(),                          // 是否用了自己的话(而非复述卡片)
  passed: z.boolean(),                             // 综合判定
  praise: z.string(),                              // 说对了什么(必须先肯定)
  gaps: z.array(z.string()),                       // 具体偏差点,给线索不给答案
  hint: z.string(),                                // 一句引导性提示
});

const res = await client.messages.parse({
  model: "claude-opus-5",
  max_tokens: 4000,
  output_config: { format: zodOutputFormat(ReviewSchema) },
  system: REVIEW_SYSTEM,   // 评审标准:准确>完整;鼓励口语化;复述原文=不通过
  messages: [{
    role: "user",
    content: `# 卡片原文\n${card.content}\n\n# 用户的总结\n${summary}`,
  }],
});
const review = res.parsed_output;  // 类型安全,可能为 null 需判空
```

判定规则(在系统提示词中固化):`passed = accuracy ≥ 7 && own_words === true`。completeness 只影响评语,不卡通过 —— 允许"理解了一部分"也入宇宙,降低挫败感。

## 5. 文献问答与引用

- PDF 经 Files API 上传一次,后续所有请求引用 `file_id`(beta header `files-api-2025-04-14`);
- document block 开启 `citations: {enabled: true}`,回答自动携带 `page_location` 引用;
- **注意:citations 与 `output_config.format` 不兼容(400)** —— 文献卡片走纯流式 Markdown 路线(本就是主方案,无冲突);
- 前端把 citation 渲染为 `[p.3]` 角标,点击滚动 pdf.js 到对应页。

## 6. 知识锚点注入

检索到的锚点作为 ④ 层(非缓存段)的一部分注入:

```
# 该用户已内化的相关理解(可用于类比教学)
- 「傅里叶变换」:用户的话——"换一组基来看信号"
- 「线性无关」:用户的话——"谁也表示不了谁"

若某条理解与本卡片概念有真实的结构相似性,请显式用它做类比
(如:"就像你理解的傅里叶变换是换基,量子态的测量也是……")。
没有合适的类比就忽略,不要生搬硬套。
```

## 7. 失败与降级矩阵

| 故障 | 表现 | 处理 |
|---|---|---|
| 429 / 5xx | SDK 抛错 | SDK 自动重试 2 次;仍失败 → 卡片 error 态 + 重试按钮 |
| refusal | `stop_reason:"refusal"` | server-side fallbacks 自动换模型;链路全拒 → refused 态 |
| 流中断 | SSE 断开 | 已收文本落库;前端重连拉 `/api/cards/:id` 补齐 |
| parse 校验失败 | `parsed_output` 为 null | 重试 1 次;再失败按"未通过+系统繁忙"降级返回 |
| 缓存零命中 | usage 监控告警 | 按 shared 排查表查静默失效点(时间戳/序列化/工具变更) |

## 8. 成本估算(单张卡片,命中缓存的典型深挖)

| 项 | Token | 说明 |
|---|---|---|
| 缓存读(①②③) | ~3–15K × 0.1 价 | 系统提示词+文献+分支上下文 |
| 新输入(④) | ~0.5K 全价 | 指令+术语+锚点 |
| 输出(含思考) | ~1.5–3K | 正文 + adaptive thinking |

按 Opus 5($5/$25 每百万 token)估算,**典型一张卡片 ≈ $0.05–0.1**;无文献的浅树更低。每日免费额度建议 20 张卡片,订阅解锁。
