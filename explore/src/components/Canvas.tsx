"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import type { CardDTO, CardUsage, TreeDTO } from "@/lib/dto";
import { CardNode, type CardFlowNode } from "./CardNode";
import { SummaryModal } from "./SummaryModal";
import { InputModal } from "./InputModal";

const NODE_W = 380;
const NODE_H = 420; // 估算高度,仅用于布局
const FLUSH_MS = 80; // 流式渲染节流窗口

const nodeTypes = { card: CardNode };

export interface CanvasApi {
  /** 文献划词提问:以根卡片为父,创建解释卡片 */
  createFromQuote: (quote: string) => void;
}

function layout(cards: CardDTO[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 110 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(cards.map((c) => c.id));
  for (const c of cards) g.setNode(c.id, { width: NODE_W, height: NODE_H });
  for (const c of cards) {
    if (c.parentId && ids.has(c.parentId)) g.setEdge(c.parentId, c.id);
  }
  dagre.layout(g);
  const pos = new Map<string, { x: number; y: number }>();
  for (const c of cards) {
    const n = g.node(c.id);
    pos.set(c.id, { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 });
  }
  return pos;
}

type InputMode = { mode: "related" | "branch"; cardId: string };

function CanvasInner({
  initialTree,
  onCiteClick,
  registerApi,
}: {
  initialTree: TreeDTO;
  onCiteClick?: (page: number) => void;
  registerApi?: (api: CanvasApi) => void;
}) {
  const [cards, setCards] = useState<Record<string, CardDTO>>(() =>
    Object.fromEntries(initialTree.cards.map((c) => [c.id, c])),
  );
  const [overrides, setOverrides] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [summaryCardId, setSummaryCardId] = useState<string | null>(null);
  const [inputModal, setInputModal] = useState<InputMode | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const opened = useRef(new Set<string>());
  const { setCenter, fitView } = useReactFlow();

  const patchCard = useCallback((id: string, patch: Partial<CardDTO>) => {
    setCards((prev) =>
      prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev,
    );
  }, []);

  // ---------- 流式渲染节流:delta 先进缓冲,每 80ms 批量入 state ----------
  const deltaBuffer = useRef(new Map<string, string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushDeltas = useCallback(() => {
    flushTimer.current = null;
    if (deltaBuffer.current.size === 0) return;
    const entries = [...deltaBuffer.current.entries()];
    deltaBuffer.current.clear();
    setCards((prev) => {
      const next = { ...prev };
      for (const [id, text] of entries) {
        if (next[id]) next[id] = { ...next[id], content: next[id].content + text };
      }
      return next;
    });
  }, []);

  const queueDelta = useCallback(
    (id: string, text: string) => {
      deltaBuffer.current.set(id, (deltaBuffer.current.get(id) ?? "") + text);
      if (!flushTimer.current) {
        flushTimer.current = setTimeout(flushDeltas, FLUSH_MS);
      }
    },
    [flushDeltas],
  );

  const dropBuffered = useCallback((id: string) => {
    deltaBuffer.current.delete(id);
  }, []);

  const openStream = useCallback(
    (cardId: string) => {
      if (opened.current.has(cardId)) return;
      opened.current.add(cardId);

      const es = new EventSource(`/api/cards/${cardId}/stream`);

      es.addEventListener("delta", (e) => {
        const { text } = JSON.parse((e as MessageEvent).data) as {
          text: string;
        };
        queueDelta(cardId, text);
      });
      es.addEventListener("terms", (e) => {
        const { terms } = JSON.parse((e as MessageEvent).data);
        patchCard(cardId, { terms });
      });
      es.addEventListener("done", (e) => {
        const { content, usage } = JSON.parse((e as MessageEvent).data) as {
          content?: string;
          usage?: CardUsage | null;
        };
        dropBuffered(cardId); // done 携带最终全文,丢弃未刷新的缓冲
        patchCard(cardId, {
          status: "done",
          ...(content !== undefined ? { content } : {}),
          ...(usage ? { usage } : {}),
        });
        es.close();
      });
      es.addEventListener("refused", () => {
        dropBuffered(cardId);
        patchCard(cardId, { status: "refused" });
        es.close();
      });
      es.addEventListener("gen_error", () => {
        dropBuffered(cardId);
        patchCard(cardId, { status: "error" });
        opened.current.delete(cardId);
        es.close();
      });
      es.onerror = async () => {
        es.close();
        opened.current.delete(cardId);
        // 断线补齐:从 DB 拉全文
        try {
          const res = await fetch(`/api/cards/${cardId}`);
          if (res.ok) {
            const fresh = (await res.json()) as CardDTO;
            dropBuffered(cardId);
            setCards((prev) => ({ ...prev, [cardId]: fresh }));
            if (fresh.status === "generating") {
              setTimeout(() => openStream(cardId), 1500);
            }
          }
        } catch {
          patchCard(cardId, { status: "error" });
        }
      };
    },
    [queueDelta, dropBuffered, patchCard],
  );

  // 挂载 / 卡片集变化时:为所有 generating 卡片建立流
  useEffect(() => {
    for (const c of Object.values(cards)) {
      if (c.status === "generating") openStream(c.id);
    }
  }, [cards, openStream]);

  // ---------- 结构化布局:仅在树结构/折叠变化时重算 dagre ----------
  const structural = useMemo(() => {
    const all = Object.values(cards);
    const byParent = new Map<string, CardDTO[]>();
    for (const c of all) {
      if (c.parentId) {
        const list = byParent.get(c.parentId) ?? [];
        list.push(c);
        byParent.set(c.parentId, list);
      }
    }
    const hidden = new Set<string>();
    const markHidden = (id: string) => {
      for (const child of byParent.get(id) ?? []) {
        hidden.add(child.id);
        markHidden(child.id);
      }
    };
    for (const c of all) {
      if (c.collapsed && !hidden.has(c.id)) markHidden(c.id);
    }
    const visible = all.filter((c) => !hidden.has(c.id));
    const sig = visible
      .map((c) => `${c.id}:${c.parentId ?? ""}:${c.collapsed ? 1 : 0}`)
      .sort()
      .join("|");
    return { visible, byParent, sig };
  }, [cards]);

  const posMap = useMemo(
    () => layout(structural.visible),
    // 只依赖结构签名 —— 流式内容更新不触发 dagre 重排
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structural.sig],
  );

  const getPos = useCallback(
    (id: string) => overrides[id] ?? posMap.get(id) ?? { x: 0, y: 0 },
    [overrides, posMap],
  );

  const focusCard = useCallback(
    (id: string) => {
      const p = getPos(id);
      setCenter(p.x + NODE_W / 2, p.y + NODE_H / 2, {
        zoom: 0.9,
        duration: 500,
      });
    },
    [getPos, setCenter],
  );

  // 新卡片创建后镜头跟随
  useEffect(() => {
    if (pendingFocusId && cards[pendingFocusId] && posMap.has(pendingFocusId)) {
      focusCard(pendingFocusId);
      setPendingFocusId(null);
    }
  }, [pendingFocusId, cards, posMap, focusCard]);

  // Esc 返回全景
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (summaryCardId || inputModal) return; // 弹窗自己处理
      fitView({ duration: 400, maxZoom: 0.85, padding: 0.2 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fitView, summaryCardId, inputModal]);

  // 拖拽:位置写入 overrides,布局重算时保留用户手动位置
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setOverrides((prev) => {
      let next: typeof prev | null = null;
      for (const ch of changes) {
        if (ch.type === "position" && ch.position) {
          next = next ?? { ...prev };
          next[ch.id] = ch.position;
        }
      }
      return next ?? prev;
    });
  }, []);

  const createCard = useCallback(
    async (body: {
      parentId: string;
      type?: string;
      term: string;
      quote?: string;
    }) => {
      try {
        const res = await fetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          alert(err?.error ?? "创建卡片失败");
          return;
        }
        const data = (await res.json()) as {
          card?: CardDTO;
          redirect?: string;
        };
        if (data.redirect) {
          setPendingFocusId(data.redirect);
          return;
        }
        if (data.card) {
          const card = data.card;
          setCards((prev) => {
            const next = { ...prev, [card.id]: card };
            if (card.parentId && next[card.parentId]?.collapsed) {
              next[card.parentId] = { ...next[card.parentId], collapsed: false };
            }
            return next;
          });
          setPendingFocusId(card.id);
        }
      } catch {
        alert("网络错误,请重试");
      }
    },
    [],
  );

  const onTermClick = useCallback(
    (parentCardId: string, term: string) =>
      createCard({ parentId: parentCardId, type: "child", term }),
    [createCard],
  );

  const onRelated = useCallback(
    (cardId: string) => setInputModal({ mode: "related", cardId }),
    [],
  );
  const onBranch = useCallback(
    (cardId: string) => setInputModal({ mode: "branch", cardId }),
    [],
  );

  const onToggleCollapse = useCallback(
    (cardId: string, collapsed: boolean) => {
      patchCard(cardId, { collapsed });
      fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collapsed }),
      }).catch(() => {});
    },
    [patchCard],
  );

  const onDelete = useCallback(
    async (cardId: string) => {
      const card = cards[cardId];
      if (!card) return;
      const descendants: string[] = [];
      const walk = (id: string) => {
        for (const c of structural.byParent.get(id) ?? []) {
          descendants.push(c.id);
          walk(c.id);
        }
      };
      walk(cardId);
      const msg =
        descendants.length > 0
          ? `删除《${card.title}》及其 ${descendants.length} 张后代卡片?`
          : `删除《${card.title}》?`;
      if (!window.confirm(msg)) return;

      const res = await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        alert(err?.error ?? "删除失败");
        return;
      }
      const removed = new Set([cardId, ...descendants]);
      setCards((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(([id]) => !removed.has(id)),
        ),
      );
      setOverrides((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(([id]) => !removed.has(id)),
        ),
      );
    },
    [cards, structural.byParent],
  );

  const onRetry = useCallback(
    (cardId: string) => {
      patchCard(cardId, { status: "generating", content: "" });
      opened.current.delete(cardId);
      openStream(cardId);
    },
    [openStream, patchCard],
  );

  const onRegenerate = useCallback(
    async (cardId: string) => {
      const card = cards[cardId];
      if (!card) return;
      if (
        !window.confirm(
          `重新生成《${card.title}》?当前内容会被覆盖(子卡片不受影响)。`,
        )
      )
        return;
      const res = await fetch(`/api/cards/${cardId}/regenerate`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        alert(err?.error ?? "操作失败");
        return;
      }
      dropBuffered(cardId);
      patchCard(cardId, { status: "generating", content: "", usage: null });
      opened.current.delete(cardId);
      openStream(cardId);
    },
    [cards, dropBuffered, patchCard, openStream],
  );

  const onSummarize = useCallback((cardId: string) => {
    setSummaryCardId(cardId);
  }, []);

  const onPassed = useCallback(
    (cardId: string) => patchCard(cardId, { internalized: true }),
    [patchCard],
  );

  // 暴露给文献面板:划词提问(挂在根卡片下)
  useEffect(() => {
    if (!registerApi) return;
    const root = Object.values(cards).find((c) => c.cardType === "root");
    if (!root) return;
    registerApi({
      createFromQuote: (quote: string) => {
        const term =
          quote.length > 40 ? quote.slice(0, 40).trim() + "…" : quote.trim();
        createCard({ parentId: root.id, type: "child", term, quote });
      },
    });
  }, [registerApi, cards, createCard]);

  const { nodes, edges } = useMemo(() => {
    const { visible, byParent } = structural;

    const countDescendants = (id: string): number => {
      let n = 0;
      for (const child of byParent.get(id) ?? []) {
        n += 1 + countDescendants(child.id);
      }
      return n;
    };

    const nodes: Node[] = visible.map(
      (c) =>
        ({
          id: c.id,
          type: "card",
          position: getPos(c.id),
          data: {
            card: c,
            childCount: (byParent.get(c.id) ?? []).length,
            hiddenDescendants: c.collapsed ? countDescendants(c.id) : 0,
            onTermClick,
            onRetry,
            onSummarize,
            onRelated,
            onBranch,
            onToggleCollapse,
            onDelete,
            onRegenerate,
            onCiteClick,
          },
          draggable: true,
        }) satisfies CardFlowNode,
    );
    const visibleIds = new Set(visible.map((c) => c.id));
    const edges: Edge[] = visible
      .filter((c) => c.parentId && visibleIds.has(c.parentId))
      .map((c) => ({
        id: `${c.parentId}-${c.id}`,
        source: c.parentId as string,
        target: c.id,
        animated: c.status === "generating",
        style: {
          stroke: c.cardType === "related" ? "#8b7cf6" : "#3d4560",
          strokeWidth: 1.5,
          strokeDasharray: c.cardType === "branch" ? "6 4" : undefined,
        },
      }));
    return { nodes, edges };
  }, [
    structural,
    getPos,
    onTermClick,
    onRetry,
    onSummarize,
    onRelated,
    onBranch,
    onToggleCollapse,
    onDelete,
    onRegenerate,
    onCiteClick,
  ]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDoubleClick={(_e, node) => focusCard(node.id)}
        fitView
        fitViewOptions={{ maxZoom: 0.85, padding: 0.2 }}
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#232838" gap={24} />
        <Controls />
        <MiniMap
          pannable
          zoomable
          nodeColor="#2b3040"
          maskColor="rgba(15,17,23,0.7)"
          style={{ background: "#181b24" }}
        />
      </ReactFlow>

      {summaryCardId && cards[summaryCardId] && (
        <SummaryModal
          cardId={summaryCardId}
          cardTitle={cards[summaryCardId].title}
          onClose={() => setSummaryCardId(null)}
          onPassed={onPassed}
        />
      )}

      {inputModal && cards[inputModal.cardId] && (
        <InputModal
          title={
            inputModal.mode === "related"
              ? `↔ 与《${cards[inputModal.cardId].title}》对比`
              : `⑂ 从《${cards[inputModal.cardId].title}》追问`
          }
          hint={
            inputModal.mode === "related"
              ? "输入想对比的概念,生成一张横向辨析卡片(例:退相干)"
              : "换个角度追问,会继承当前学习路径的上下文(例:这在实验上怎么验证?)"
          }
          placeholder={
            inputModal.mode === "related" ? "要对比的概念…" : "你的新问题…"
          }
          submitLabel="生成卡片"
          onSubmit={(v) =>
            createCard({
              parentId: inputModal.cardId,
              type: inputModal.mode,
              term: v,
            })
          }
          onClose={() => setInputModal(null)}
        />
      )}
    </>
  );
}

export function Canvas(props: {
  initialTree: TreeDTO;
  onCiteClick?: (page: number) => void;
  registerApi?: (api: CanvasApi) => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
