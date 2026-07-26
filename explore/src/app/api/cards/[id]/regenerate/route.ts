import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkConcurrency } from "@/lib/limits";

export const dynamic = "force-dynamic";

// POST /api/cards/:id/regenerate — 重置卡片为 generating,前端重开流即可重新生成
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const card = await db.card.findUnique({ where: { id } });
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (card.status === "generating") {
    return NextResponse.json({ error: "正在生成中" }, { status: 409 });
  }

  const limit = await checkConcurrency();
  if (!limit.ok) {
    return NextResponse.json({ error: limit.reason }, { status: 429 });
  }

  await db.card.update({
    where: { id },
    data: {
      status: "generating",
      contentMd: null,
      termsJson: "[]",
      usageJson: null,
      // createdAt 不变:重新生成不吃每日配额,但吃并发额度
    },
  });
  return NextResponse.json({ ok: true });
}
