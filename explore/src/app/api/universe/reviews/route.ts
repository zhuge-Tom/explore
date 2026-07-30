import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviewSummary, embed } from "@/lib/llm/gateway";
import { MIN_REVIEW_SUMMARY_LENGTH } from "@/lib/review";

export const dynamic = "force-dynamic";

// POST /api/universe/reviews {cardId, summary} — 总结评审,通过则入宇宙
export async function POST(req: Request) {
  const { cardId, summary } = (await req.json()) as {
    cardId?: string;
    summary?: string;
  };
  const text = summary?.trim();
  if (!cardId || !text) {
    return NextResponse.json(
      { error: "cardId and summary are required" },
      { status: 400 },
    );
  }
  if (text.length < MIN_REVIEW_SUMMARY_LENGTH) {
    return NextResponse.json(
      { error: `总结太短了，至少写 ${MIN_REVIEW_SUMMARY_LENGTH} 个字` },
      { status: 400 },
    );
  }

  const card = await db.card.findUnique({ where: { id: cardId } });
  if (!card || card.status !== "done" || !card.contentMd) {
    return NextResponse.json({ error: "卡片不可评审" }, { status: 409 });
  }

  const result = await reviewSummary(card.title, card.contentMd, text);
  if (!result) {
    return NextResponse.json(
      { error: "评审系统繁忙,请稍后重试" },
      { status: 503 },
    );
  }

  await db.reviewAttempt.create({
    data: {
      cardId,
      summary: text,
      resultJson: JSON.stringify(result),
      passed: result.passed,
    },
  });

  let starId: string | null = null;
  if (result.passed) {
    // embedding 可选:无 VOYAGE_API_KEY 时为 null,宇宙用树结构连线降级
    const vectors = await embed([`${card.title}:${text}`]);
    const starData = {
      concept: card.title,
      summary: text,
      reviewJson: JSON.stringify(result),
      embeddingJson: vectors ? JSON.stringify(vectors[0]) : null,
    };
    // 同一卡片重复通过 = 复习巩固:更新既有恒星(刷新理解与时间),不产生重复恒星
    const existing = await db.star.findFirst({ where: { cardId } });
    const star = existing
      ? await db.star.update({
          where: { id: existing.id },
          data: { ...starData, createdAt: new Date() },
        })
      : await db.star.create({ data: { cardId, ...starData } });
    starId = star.id;
    await db.card.update({
      where: { id: cardId },
      data: { internalized: true },
    });
  }

  // 连续两次未过的提示交给前端(attempts 计数)
  const attempts = await db.reviewAttempt.count({ where: { cardId } });

  return NextResponse.json({ ...result, starId, attempts });
}
