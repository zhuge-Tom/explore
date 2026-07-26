// [[术语|一句话预览]] 标记协议:解析与预处理(前后端共用)
// 另有 [[page:N]] 引用角标(文献树),渲染为可点击页码,不算术语。

export interface Term {
  term: string;
  preview: string;
}

const TERM_RE = /\[\[([^\][|]+?)(?:\|([^\][]*?))?\]\]/g;
const PAGE_PREFIX = "page:";

/** 从卡片 Markdown 中提取术语表(按术语去重,排除页码角标) */
export function parseTerms(md: string): Term[] {
  const seen = new Map<string, Term>();
  for (const m of md.matchAll(TERM_RE)) {
    const term = m[1].trim();
    if (!term || term.startsWith(PAGE_PREFIX)) continue;
    if (!seen.has(term)) {
      seen.set(term, { term, preview: (m[2] ?? "").trim() });
    }
  }
  return [...seen.values()];
}

/**
 * 把 [[术语|预览]] 转成 Markdown 链接 [术语](term://...?p=...),
 * [[page:N]] 转成 [p.N](cite://N),
 * 交给 react-markdown 的自定义 a 渲染器变成可点击元素。
 */
export function preprocessTerms(md: string): string {
  return md.replace(TERM_RE, (_all, rawTerm: string, preview?: string) => {
    const term = rawTerm.trim();
    if (term.startsWith(PAGE_PREFIX)) {
      const page = term.slice(PAGE_PREFIX.length).trim();
      return `[p.${page}](cite://${page})`;
    }
    const t = encodeURIComponent(term);
    const p = encodeURIComponent((preview ?? "").trim());
    return `[${term}](term://${t}?p=${p})`;
  });
}

/** 流式渲染时,裁掉结尾尚未闭合的 [[... 片段,避免闪烁原始标记 */
export function trimDanglingTerm(md: string): string {
  const i = md.lastIndexOf("[[");
  if (i !== -1 && !md.slice(i).includes("]]")) return md.slice(0, i);
  return md;
}
