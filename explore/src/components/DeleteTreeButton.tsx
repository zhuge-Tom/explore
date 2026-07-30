"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteTreeButton({
  treeId,
  treeTitle,
  compact = false,
  redirectToHome = false,
  onDeleted,
}: {
  treeId: string;
  treeTitle: string;
  compact?: boolean;
  redirectToHome?: boolean;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const removeTree = async () => {
    if (busy) return;
    const confirmed = window.confirm(
      `确定删除「${treeTitle}」吗？\n\n这个问题下的全部卡片、总结、评审和恒星都会永久删除。`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/trees/${treeId}`, { method: "DELETE" });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? "删除失败");
      }
      localStorage.removeItem(`explore:canvas:${treeId}`);
      onDeleted?.();
      if (redirectToHome) router.replace("/");
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "删除失败，请重试");
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`tree-delete-button${compact ? " compact" : ""}`}
      disabled={busy}
      onClick={removeTree}
      aria-label={`删除问题：${treeTitle}`}
      title="删除这个问题及其全部卡片"
    >
      {busy ? "删除中…" : "删除"}
    </button>
  );
}
