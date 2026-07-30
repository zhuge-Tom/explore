"use client";

import { memo } from "react";
import { Handle, NodeResizer, Position, type NodeProps, type Node } from "@xyflow/react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

// react-markdown 默认会过滤非 http(s) 协议;放行我们的 term:// 与 cite:// 内部协议
function urlTransform(url: string): string {
  if (url.startsWith("term://") || url.startsWith("cite://")) return url;
  return defaultUrlTransform(url);
}
import type { CardDTO } from "@/lib/dto";
import { preprocessTerms, trimDanglingTerm } from "@/lib/terms";

export type CardNodeData = {
  card: CardDTO;
  childCount: number;
  hiddenDescendants: number;
  onTermClick: (parentCardId: string, term: string) => void;
  onRetry: (cardId: string) => void;
  onSummarize: (cardId: string) => void;
  onRelated: (cardId: string) => void;
  onBranch: (cardId: string) => void;
  onToggleCollapse: (cardId: string, collapsed: boolean) => void;
  onDelete: (cardId: string) => void;
  onRegenerate: (cardId: string) => void;
  onHide: (cardId: string) => void;
  onCiteClick?: (page: number) => void;
};

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export type CardFlowNode = Node<CardNodeData, "card">;

const TYPE_BADGE: Record<string, string> = {
  related: "↔ 对比",
  branch: "⑂ 分支",
};

function CardNodeInner({ data, selected }: NodeProps<CardFlowNode>) {
  const {
    card,
    childCount,
    hiddenDescendants,
    onTermClick,
    onRetry,
    onSummarize,
    onRelated,
    onBranch,
    onToggleCollapse,
    onDelete,
    onRegenerate,
    onHide,
    onCiteClick,
  } = data;
  const generating = card.status === "generating";

  const usage = card.usage;
  const totalInput = usage
    ? usage.input + usage.cacheRead + usage.cacheWrite
    : 0;
  const cachePct =
    usage && totalInput > 0
      ? Math.round((usage.cacheRead / totalInput) * 100)
      : null;

  const md = preprocessTerms(
    generating ? trimDanglingTerm(card.content) : card.content,
  );

  return (
    <div className={`card-node ${card.status}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={360}
        minHeight={280}
        lineClassName="card-resize-line"
        handleClassName="card-resize-handle"
      />
      <Handle type="target" position={Position.Left} />
      {card.path.length > 0 && (
        <div className="crumb" title={card.path.join(" › ")}>
          {card.path.join(" › ")}
        </div>
      )}
      <div className="title">
        {card.internalized && <span title="已内化到思维宇宙">⭐ </span>}
        {TYPE_BADGE[card.cardType] && (
          <span className="type-badge">{TYPE_BADGE[card.cardType]}</span>
        )}
        {card.title}
      </div>
      <div className="body nowheel">
        <div
          className="card-markdown nodrag"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={urlTransform}
            components={{
            a: ({ href, children }) => {
              if (href?.startsWith("term://")) {
                const rest = href.slice("term://".length);
                const qIdx = rest.indexOf("?p=");
                const term = decodeURIComponent(
                  qIdx === -1 ? rest : rest.slice(0, qIdx),
                );
                const preview =
                  qIdx === -1 ? "" : decodeURIComponent(rest.slice(qIdx + 3));
                return (
                  <button
                    className="term-link nodrag"
                    title={preview || "点击深入"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!generating) onTermClick(card.id, term);
                    }}
                  >
                    {children}
                  </button>
                );
              }
              if (href?.startsWith("cite://")) {
                const page = Number(href.slice("cite://".length));
                return (
                  <button
                    className="cite-badge nodrag"
                    title={`跳转到原文第 ${page} 页`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCiteClick?.(page);
                    }}
                  >
                    {children}
                  </button>
                );
              }
              return (
                <a className="nodrag" href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            },
            }}
          >
            {md}
          </ReactMarkdown>
          {generating && <span className="cursor-blink" />}
        </div>
      </div>
      <div className="status-line">
        {generating && <span>✨ 生成中…</span>}
        {card.status === "refused" && <span>该内容无法生成</span>}
        {card.status === "error" && (
          <>
            <span>生成失败</span>
            <button className="retry-btn nodrag" onClick={() => onRetry(card.id)}>
              重试
            </button>
          </>
        )}
        {card.status === "done" && (
          <span className="actions nodrag">
            <button
              className="action-btn"
              title="用自己的话总结,通过评审后进入思维宇宙"
              onClick={() => onSummarize(card.id)}
            >
              ✍️ 总结
            </button>
            <button
              className="action-btn"
              title="与另一个概念横向对比"
              onClick={() => onRelated(card.id)}
            >
              ↔ 对比
            </button>
            <button
              className="action-btn"
              title="继承上下文,换个角度追问"
              onClick={() => onBranch(card.id)}
            >
              ⑂ 追问
            </button>
            {childCount > 0 && (
              <button
                className="action-btn"
                title={card.collapsed ? "展开子树" : "折叠子树"}
                onClick={() => onToggleCollapse(card.id, !card.collapsed)}
              >
                {card.collapsed ? `▸ +${hiddenDescendants}` : "▾ 折叠"}
              </button>
            )}
            <button
              className="action-btn"
              title="重新生成本卡片(覆盖当前内容)"
              onClick={() => onRegenerate(card.id)}
            >
              🔄
            </button>
            <button className="action-btn" title="暂时隐藏这张卡片" onClick={() => onHide(card.id)}>
              ◌ 隐藏
            </button>
            {card.cardType !== "root" && (
              <button
                className="action-btn del"
                title="删除此卡片及其子树"
                onClick={() => onDelete(card.id)}
              >
                🗑
              </button>
            )}
            {usage && (
              <span
                className="usage-badge"
                title={`输入 ${totalInput} tokens(其中缓存读取 ${usage.cacheRead})· 输出 ${usage.output} tokens`}
              >
                {fmtTokens(totalInput)}↑ {fmtTokens(usage.output)}↓
                {cachePct !== null && cachePct > 0 && ` · 缓存${cachePct}%`}
              </span>
            )}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const CardNode = memo(CardNodeInner, (prev, next) =>
  prev.selected === next.selected &&
  prev.data.card === next.data.card &&
  prev.data.childCount === next.data.childCount &&
  prev.data.hiddenDescendants === next.data.hiddenDescendants &&
  prev.data.onCiteClick === next.data.onCiteClick
);
