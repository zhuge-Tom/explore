import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkCardLimits } from "@/lib/limits";
import { encodeImageContext, isImageAttachment, type ImageAttachment } from "@/lib/image-attachments";

export const dynamic = "force-dynamic";

// GET /api/trees — 树列表
export async function GET() {
  const trees = await db.tree.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { cards: true } }, document: true },
  });
  return NextResponse.json(
    trees.map((t) => ({
      id: t.id,
      title: t.title,
      cardCount: t._count.cards,
      documentName: t.document?.filename ?? null,
      updatedAt: t.updatedAt.toISOString(),
    })),
  );
}

// POST /api/trees {question, documentId?} — 新建树 + 根卡片
export async function POST(req: Request) {
  const { question, documentId, images } = (await req.json()) as {
    question?: string;
    documentId?: string;
    images?: unknown[];
  };
  const q = question?.trim();
  if (!q) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  const validImages = Array.isArray(images) ? images.filter(isImageAttachment) : [];
  if (validImages.length > 4) {
    return NextResponse.json({ error: "最多可添加 4 张图片" }, { status: 400 });
  }

  const limit = await checkCardLimits();
  if (!limit.ok) {
    return NextResponse.json({ error: limit.reason }, { status: 429 });
  }

  if (documentId) {
    const doc = await db.document.findUnique({ where: { id: documentId } });
    if (!doc) {
      return NextResponse.json({ error: "document not found" }, { status: 404 });
    }
    if (!doc.anthropicFileId) {
      return NextResponse.json(
        { error: "文献尚未完成处理,请稍后重试" },
        { status: 409 },
      );
    }
  }

  const tree = await db.tree.create({
    data: {
      title: q.length > 80 ? q.slice(0, 80) + "…" : q,
      documentId: documentId ?? null,
    },
  });
  const root = await db.card.create({
    data: {
      treeId: tree.id,
      cardType: "root",
      title: q,
      quoteText: validImages.length
        ? encodeImageContext({ images: validImages as ImageAttachment[] })
        : null,
      depth: 0,
      pathJson: "[]",
      status: "generating",
    },
  });

  return NextResponse.json({ treeId: tree.id, rootCardId: root.id });
}
