"use client";

import Link from "next/link";
import { useState } from "react";
import { DeleteTreeButton } from "./DeleteTreeButton";

export interface TreeListItem {
  id: string;
  title: string;
  cardCount: number;
  documentName: string | null;
}

export function TreeList({ initial }: { initial: TreeListItem[] }) {
  const [trees, setTrees] = useState(initial);
  const [filter, setFilter] = useState("");

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
          <Link className="tree-list-link" href={`/tree/${t.id}`}>
            <span>
              {t.documentName && <span title={t.documentName}>📄 </span>}
              {t.title}
            </span>
            <span className="meta">{t.cardCount} 张卡片</span>
          </Link>
          <DeleteTreeButton
            treeId={t.id}
            treeTitle={t.title}
            compact
            onDeleted={() => setTrees((prev) => prev.filter((tree) => tree.id !== t.id))}
          />
        </li>
      ))}
    </ul>
    </>
  );
}
