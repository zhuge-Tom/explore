import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cosine } from "@/lib/similarity";

export const dynamic = "force-dynamic";

const SEMANTIC_LINK_THRESHOLD = 0.75;

// GET /api/universe — 思维宇宙全量图数据(恒星 + 连线)
export async function GET() {
  const stars = await db.star.findMany({
    include: {
      card: {
        select: {
          id: true,
          treeId: true,
          parentId: true,
          pathJson: true,
          tree: { select: { title: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // 树结构连线:沿祖先链向上找最近的另一颗恒星
  const starByCardId = new Map(stars.map((s) => [s.cardId, s]));
  const treeIds = [...new Set(stars.map((s) => s.card.treeId))];
  const allCards = await db.card.findMany({
    where: { treeId: { in: treeIds } },
    select: { id: true, parentId: true },
  });
  const parentOf = new Map(allCards.map((c) => [c.id, c.parentId]));

  const links: { source: string; target: string; kind: string }[] = [];
  for (const s of stars) {
    let cur = parentOf.get(s.cardId) ?? null;
    while (cur) {
      const ancestorStar = starByCardId.get(cur);
      if (ancestorStar) {
        links.push({ source: ancestorStar.id, target: s.id, kind: "tree" });
        break;
      }
      cur = parentOf.get(cur) ?? null;
    }
  }

  // 语义连线(有 embedding 时):余弦相似度超阈值的暗线
  const withVec = stars
    .filter((s) => s.embeddingJson)
    .map((s) => ({ id: s.id, vec: JSON.parse(s.embeddingJson!) as number[] }));
  const linked = new Set(
    links.map((l) => [l.source, l.target].sort().join("|")),
  );
  for (let i = 0; i < withVec.length; i++) {
    for (let j = i + 1; j < withVec.length; j++) {
      const key = [withVec[i].id, withVec[j].id].sort().join("|");
      if (linked.has(key)) continue;
      if (cosine(withVec[i].vec, withVec[j].vec) >= SEMANTIC_LINK_THRESHOLD) {
        links.push({
          source: withVec[i].id,
          target: withVec[j].id,
          kind: "semantic",
        });
        linked.add(key);
      }
    }
  }

  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }

  return NextResponse.json({
    stars: stars.map((s) => ({
      id: s.id,
      concept: s.concept,
      summary: s.summary,
      review: JSON.parse(s.reviewJson),
      cardId: s.cardId,
      treeId: s.card.treeId,
      treeTitle: s.card.tree.title,
      path: JSON.parse(s.card.pathJson) as string[],
      degree: degree.get(s.id) ?? 0,
      createdAt: s.createdAt.toISOString(),
    })),
    links,
  });
}
