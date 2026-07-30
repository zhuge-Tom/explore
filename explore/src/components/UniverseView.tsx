"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";

interface StarDTO {
  id: string;
  concept: string;
  summary: string;
  review: { praise?: string };
  cardId: string;
  treeId: string;
  treeTitle: string;
  path: string[];
  degree: number;
  createdAt: string;
}

interface UniverseData {
  stars: StarDTO[];
  links: { source: string; target: string; kind: string }[];
}

interface PositionedStar extends StarDTO {
  x: number;
  y: number;
  size: number;
}

interface PanelPosition {
  x: number;
  y: number;
}

const STAR_ASSETS = [
  "/assets/stars/star-aurora.svg",
  "/assets/stars/star-solar.svg",
  "/assets/stars/star-violet.svg",
  "/assets/stars/star-rose.svg",
  "/assets/stars/star-mint.svg",
  "/assets/stars/licensed-nebula.webp",
  "/assets/stars/licensed-star-cluster.webp",
] as const;

function hashText(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function starAssetFor(id: string) {
  return STAR_ASSETS[hashText(id) % STAR_ASSETS.length];
}

function positionStars(stars: StarDTO[]): PositionedStar[] {
  if (stars.length === 1) return [{ ...stars[0], x: 50, y: 48, size: 58 }];
  const columns = Math.max(2, Math.ceil(Math.sqrt(stars.length * 1.5)));
  const rows = Math.ceil(stars.length / columns);
  return stars.map((star, index) => {
    const seed = hashText(star.id);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const jitterX = ((seed % 100) / 100 - 0.5) * Math.min(7, 28 / columns);
    const jitterY = (((seed >>> 8) % 100) / 100 - 0.5) * Math.min(8, 30 / rows);
    return {
      ...star,
      x: Math.max(9, Math.min(91, 10 + ((column + 0.5) / columns) * 80 + jitterX)),
      y: Math.max(14, Math.min(84, 12 + ((row + 0.5) / rows) * 72 + jitterY)),
      size: 42 + Math.min(16, star.degree * 3),
    };
  });
}

function decorativeStars(count = 130) {
  let seed = 928371;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    x: random() * 100,
    y: 34 + Math.pow(random(), 0.72) * 65,
    size: 1 + random() * 2.2,
    opacity: 0.25 + random() * 0.7,
    delay: -random() * 7,
    duration: 2.2 + random() * 4.8,
  }));
}

export function UniverseView() {
  const [data, setData] = useState<UniverseData | null>(null);
  const [selected, setSelected] = useState<StarDTO | null>(null);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const [error, setError] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const panelDragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/universe")
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed");
        return response.json() as Promise<UniverseData>;
      })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const stars = useMemo(() => positionStars(data?.stars ?? []), [data]);
  const starPositions = useMemo(
    () => new Map(stars.map((star) => [star.id, star])),
    [stars],
  );
  const backgroundStars = useMemo(() => decorativeStars(), []);

  const openStar = (star: StarDTO) => {
    setPanelPosition(null);
    setSelected(star);
  };

  const closePanel = () => {
    panelDragRef.current = null;
    setPanelPosition(null);
    setSelected(null);
  };

  const startPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !panelRef.current) return;

    const panelRect = panelRef.current.getBoundingClientRect();
    panelDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
    };
    setPanelPosition({
      x: panelRect.left,
      y: panelRect.top,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const movePanel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panelDragRef.current;
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      !panelRef.current
    ) return;

    const margin = 8;
    const panelRect = panelRef.current.getBoundingClientRect();
    const maxX = Math.max(margin, window.innerWidth - panelRect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - panelRect.height - margin);
    setPanelPosition({
      x: Math.min(maxX, Math.max(margin, event.clientX - drag.offsetX)),
      y: Math.min(maxY, Math.max(margin, event.clientY - drag.offsetY)),
    });
  };

  const stopPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panelDragRef.current?.pointerId !== event.pointerId) return;
    panelDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="universe-page">
      <header className="canvas-header">
        <Link href="/">← 返回</Link>
        <h1>思维宇宙 · {data ? data.stars.length + " 颗恒星" : "…"}</h1>
      </header>

      <div className="universe-wrap">
        <div className="universe-nebula" aria-hidden="true" />
        <div className="universe-starfield" aria-hidden="true">
          {backgroundStars.map((star) => (
            <span
              key={star.id}
              style={{
                left: star.x + "%",
                top: star.y + "%",
                width: star.size,
                height: star.size,
                opacity: star.opacity,
                animationDelay: star.delay + "s",
                animationDuration: star.duration + "s",
              }}
            />
          ))}
        </div>

        {error && <p className="universe-loading">宇宙加载失败，请刷新后重试</p>}
        {!data && !error && <p className="universe-loading">宇宙正在成形…</p>}

        {data && data.stars.length === 0 && (
          <div className="universe-empty">
            <span className="empty-star" aria-hidden="true">✦</span>
            <h2>你的宇宙还是一片宁静</h2>
            <p>在任意卡片上点击“总结”，用自己的话写下理解。AI 评审通过后，这里就会点亮第一颗恒星。</p>
            <Link href="/">去探索知识 →</Link>
          </div>
        )}

        {data && stars.length > 0 && (
          <div className="constellation-stage" aria-label="知识恒星图">
            <svg className="constellation-links" aria-hidden="true">
              {data.links.map((link) => {
                const source = starPositions.get(link.source);
                const target = starPositions.get(link.target);
                if (!source || !target) return null;
                return (
                  <line
                    key={link.source + "-" + link.target + "-" + link.kind}
                    x1={source.x + "%"}
                    y1={source.y + "%"}
                    x2={target.x + "%"}
                    y2={target.y + "%"}
                    className={link.kind === "semantic" ? "semantic" : "tree"}
                  />
                );
              })}
            </svg>

            {stars.map((star) => {
              const context = star.path.length > 0
                ? "知识树 · " + star.treeTitle + " · " + star.path.join(" › ")
                : "知识树 · " + star.treeTitle;
              const style = {
                left: star.x + "%",
                top: star.y + "%",
                "--star-size": star.size + "px",
                "--star-delay": "-" + (hashText(star.id) % 40) / 10 + "s",
              } as CSSProperties;
              return (
                <div
                  key={star.id}
                  className={"knowledge-star " + (star.x > 72 ? "label-left " : "") + (selected?.id === star.id ? "selected" : "")}
                  style={style}
                >
                  <button
                    type="button"
                    className="star-button"
                    onClick={() => openStar(star)}
                    aria-label={"打开知识点：" + star.concept}
                  >
                    <span className="star-orb" aria-hidden="true">
                      <img
                        className="star-image"
                        src={starAssetFor(star.id)}
                        alt=""
                        draggable={false}
                      />
                      <span className="star-core" />
                    </span>
                  </button>
                  <span className="star-label">
                    <strong>{star.concept}</strong>
                    <small>{context}</small>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {selected && (
          <aside
            ref={panelRef}
            className={"star-panel" + (panelPosition ? " is-positioned" : "")}
            style={panelPosition ? { left: panelPosition.x, top: panelPosition.y } : undefined}
          >
            <div
              className="star-panel-drag-handle"
              onPointerDown={startPanelDrag}
              onPointerMove={movePanel}
              onPointerUp={stopPanelDrag}
              onPointerCancel={stopPanelDrag}
            >
              <div>
                <p className="star-panel-kicker">已内化的知识点</p>
                <h2>{selected.concept}</h2>
              </div>
              <button
                className="modal-close"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={closePanel}
                aria-label="关闭知识点"
              >
                ×
              </button>
            </div>
            <p className="star-origin">
              {selected.treeTitle}
              {selected.path.length > 0 && " · " + selected.path.join(" › ")}
            </p>
            <p className="star-date">
              {new Date(selected.createdAt).toLocaleDateString("zh-CN")} 点亮
              {(() => {
                const days = Math.floor(
                  (Date.now() - new Date(selected.createdAt).getTime()) / 86400000,
                );
                return days >= 7 ? (
                  <span className="review-due"> · 已过 {days} 天，建议回到卡片重新总结</span>
                ) : null;
              })()}
            </p>
            <div className="star-section">
              <h3>我的理解</h3>
              <p>{selected.summary}</p>
            </div>
            {selected.review?.praise && (
              <div className="star-section star-review">
                <h3>AI 评语</h3>
                <p>{selected.review.praise}</p>
              </div>
            )}
            <Link className="star-link" href={"/tree/" + selected.treeId}>
              回到来源知识树 →
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}
