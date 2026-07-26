import { NextResponse } from "next/server";
import type { Card } from "@prisma/client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  related: "对比",
  branch: "分支追问",
};

/** 卡片正文的标记转成通用 Markdown:[[术语|预览]] → **术语**,[[page:N]] → (p.N) */
function plainMarkdown(md: string): string {
  return md.replace(
    /\[\[([^\][|]+?)(?:\|[^\][]*?)?\]\]/g,
    (_all, term: string) => {
      const t = term.trim();
      if (t.startsWith("page:")) return `(p.${t.slice(5)})`;
      return `**${t}**`;
    },
  );
}

// GET /api/trees/:id/export — 整树导出为 Markdown 学习笔记
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tree = await db.tree.findUnique({
    where: { id },
    include: {
      cards: { orderBy: { createdAt: "asc" } },
      document: true,
    },
  });
  if (!tree) return NextResponse.json({ error: "not found" }, { status: 404 });

  const byParent = new Map<string | null, Card[]>();
  for (const c of tree.cards) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }

  const lines: string[] = [
    `# ${tree.title}`,
    "",
    `> 由 Explore 导出${tree.document ? ` · 文献:${tree.document.filename}` : ""} · ${tree.cards.filter((c) => c.status === "done").length} 张卡片`,
    "",
  ];

  const walk = (parentId: string | null, depth: number) => {
    for (const card of byParent.get(parentId) ?? []) {
      if (card.status !== "done" || !card.contentMd) {
        walk(card.id, depth); // 跳过未完成节点但保留其子树
        continue;
      }
      const h = "#".repeat(Math.min(depth + 2, 6));
      const badge = [
        card.internalized ? "⭐" : "",
        TYPE_LABEL[card.cardType] ? `〔${TYPE_LABEL[card.cardType]}〕` : "",
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(`${h} ${badge ? badge + " " : ""}${card.title}`, "");
      if (card.quoteText) {
        lines.push(`> 原文:${card.quoteText}`, "");
      }
      lines.push(plainMarkdown(card.contentMd), "");
      walk(card.id, depth + 1);
    }
  };
  walk(null, 0);

  const filename = `${tree.title.slice(0, 40).replace(/[\\/:*?"<>|]/g, "_")}.md`;
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
