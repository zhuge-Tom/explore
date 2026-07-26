"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
  loading: () => <p className="universe-loading">宇宙加载中…</p>,
});

interface StarDTO {
  id: string;
  concept: string;
  summary: string;
  review: { praise?: string };
  cardId: string;
  treeId: string;
  degree: number;
  createdAt: string;
}

interface UniverseData {
  stars: StarDTO[];
  links: { source: string; target: string; kind: string }[];
}

export function UniverseView() {
  const [data, setData] = useState<UniverseData | null>(null);
  const [selected, setSelected] = useState<StarDTO | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/universe")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="universe-page">
      <header className="canvas-header">
        <Link href="/">← 返回</Link>
        <h1>🌌 思维宇宙 · {data ? `${data.stars.length} 颗恒星` : "…"}</h1>
      </header>

      <div className="universe-wrap">
        {error && <p className="universe-loading">加载失败,请刷新</p>}
        {data && data.stars.length === 0 && (
          <div className="universe-empty">
            <p>你的宇宙还是一片虚空。</p>
            <p>
              在任意卡片上点击「✍️ 总结」,用自己的话写下理解,通过 AI
              评审后就会点亮第一颗恒星 ✨
            </p>
            <Link href="/">去探索 →</Link>
          </div>
        )}
        {data && data.stars.length > 0 && (
          <ForceGraph3D
            graphData={{
              nodes: data.stars.map((s) => ({
                id: s.id,
                name: s.concept,
                val: 2 + s.degree * 1.5,
                group: s.treeId,
              })),
              links: data.links.map((l) => ({
                source: l.source,
                target: l.target,
                kind: l.kind,
              })),
            }}
            backgroundColor="#0a0c12"
            nodeAutoColorBy="group"
            nodeLabel="name"
            nodeOpacity={0.92}
            linkColor={(l) =>
              (l as { kind?: string }).kind === "semantic"
                ? "#4a3f78"
                : "#3d4560"
            }
            linkOpacity={0.45}
            linkWidth={1}
            onNodeClick={(node) => {
              const id = (node as { id?: string | number }).id;
              const star = data.stars.find((s) => s.id === id);
              if (star) setSelected(star);
            }}
          />
        )}

        {selected && (
          <aside className="star-panel">
            <button className="modal-close" onClick={() => setSelected(null)}>
              ×
            </button>
            <h2>⭐ {selected.concept}</h2>
            <p className="star-date">
              {new Date(selected.createdAt).toLocaleDateString("zh-CN")} 内化
              {(() => {
                const days = Math.floor(
                  (Date.now() - new Date(selected.createdAt).getTime()) /
                    86400000,
                );
                return days >= 7 ? (
                  <span className="review-due">
                    {" "}
                    · 已过 {days} 天,该复习了 —— 回到卡片重新总结一次,恒星会被点亮刷新
                  </span>
                ) : null;
              })()}
            </p>
            <div className="star-section">
              <h3>我的理解</h3>
              <p>{selected.summary}</p>
            </div>
            {selected.review?.praise && (
              <div className="star-section">
                <h3>AI 评语</h3>
                <p>{selected.review.praise}</p>
              </div>
            )}
            <Link className="star-link" href={`/tree/${selected.treeId}`}>
              回到来源卡片 →
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}
