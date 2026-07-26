"use client";

import { useState } from "react";
import Link from "next/link";

export interface TreeListItem {
  id: string;
  title: string;
  cardCount: number;
  documentName: string | null;
}

export function TreeList({ initial }: { initial: TreeListItem[] }) {
  const [trees, setTrees] = useState(initial);
  const [filter, setFilter] = useState("");

  async function remove(id: string, title: string) {
    if (
      !window.confirm(
        `确定删除「${title}」?\n这棵树的所有卡片和评审记录都会被删除(已入宇宙的恒星也会消失)。`,
      )
    )
      return;
    const res = await fetch(`/api/trees/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTrees((prev) => prev.filter((t) => t.id !== id));
    } else {
      alert("删除失败,请重试");
    }
  }

  if (trees.length === 0) return null;

  const q = filter.trim().toLowerCase();
  const shown = q
    ? trees.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.documentName?.toLowerCase().includes(q),
      )
    : trees;

  return (
    <>
      {trees.length > 5 && (
        <input
          className="list-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="🔍 搜索知识树…"
        />
      )}
    <ul className="tree-list">
      {shown.map((t) => (
        <li key={t.id}>
          <Link href={`/tree/${t.id}`}>
            <span>
              {t.documentName && <span title={t.documentName}>📄 </span>}
              {t.title}
            </span>
            <span className="meta">
              {t.cardCount} 张卡片
              <button
                className="tree-del"
                title="删除这棵树"
                onClick={(e) => {
                  e.preventDefault();
                  remove(t.id, t.title);
                }}
              >
                🗑
              </button>
            </span>
          </Link>
        </li>
      ))}
    </ul>
    </>
  );
}
