import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCardDTO } from "@/lib/dto";
import { checkCardLimits } from "@/lib/limits";

export const dynamic = "force-dynamic";

const MAX_DEPTH = 12;

interface CreateCardBody {
  parentId?: string;
  type?: "child" | "related" | "branch";
  /** child/related: 术语;branch: 新问题 */
  term?: string;
  /** 文献划词提问:原文引文 */
  quote?: string;
}

// POST /api/cards — 派生卡片(child 子卡片 / related 关联对比 / branch 分支追问)
export async function POST(req: Request) {
  const body = (await req.json()) as CreateCardBody;
  const type = body.type ?? "child";
  const subject = body.term?.trim();
  const quote = body.quote?.trim();

  if (!body.parentId || !subject) {
    return NextResponse.json(
      { error: "parentId and term are required" },
      { status: 400 },
    );
  }

  const limit = await checkCardLimits();
  if (!limit.ok) {
    return NextResponse.json({ error: limit.reason }, { status: 429 });
  }

  const parent = await db.card.findUnique({ where: { id: body.parentId } });
  if (!parent) {
    return NextResponse.json({ error: "parent not found" }, { status: 404 });
  }
  if (parent.status !== "done") {
    return NextResponse.json({ error: "父卡片尚未生成完成" }, { status: 409 });
  }
  if (parent.depth + 1 > MAX_DEPTH) {
    return NextResponse.json({ error: "已达最大深度" }, { status: 400 });
  }

  // 卡片标题
  const title =
    type === "related"
      ? `${subject} vs ${parent.title}`
      : subject.length > 80
        ? subject.slice(0, 80) + "…"
        : subject;

  // 同树同名去重:已有卡片则跳转而非重复生成(划词提问不去重)
  if (!quote) {
    const existing = await db.card.findFirst({
      where: { treeId: parent.treeId, title },
    });
    if (existing) {
      return NextResponse.json({ redirect: existing.id });
    }
  }

  const path = [...(JSON.parse(parent.pathJson) as string[]), parent.title];
  const card = await db.card.create({
    data: {
      treeId: parent.treeId,
      parentId: parent.id,
      cardType: type,
      sourceTerm: subject,
      quoteText: quote || null,
      title,
      depth: parent.depth + 1,
      pathJson: JSON.stringify(path),
      status: "generating",
    },
  });
  await db.tree.update({
    where: { id: parent.treeId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ card: toCardDTO(card) });
}
