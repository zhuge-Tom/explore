import { NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { toTreeDTO } from "@/lib/dto";
import { uploadsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

// GET /api/trees/:id — 整树加载
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tree = await db.tree.findUnique({
    where: { id },
    include: { cards: { orderBy: { createdAt: "asc" } } },
  });
  if (!tree) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(toTreeDTO(tree));
}

// DELETE /api/trees/:id — 删除整棵树(卡片/恒星/评审级联)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tree = await db.tree.findUnique({
    where: { id },
    select: {
      documentId: true,
      document: { select: { localPath: true } },
    },
  });
  if (!tree) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let removedDocument = false;
  await db.$transaction(async (tx) => {
    await tx.tree.delete({ where: { id } });
    if (!tree.documentId) return;
    const remainingReferences = await tx.tree.count({
      where: { documentId: tree.documentId },
    });
    if (remainingReferences === 0) {
      await tx.document.delete({ where: { id: tree.documentId } });
      removedDocument = true;
    }
  });

  if (removedDocument && tree.document?.localPath) {
    const root = path.resolve(uploadsDir());
    const file = path.resolve(root, tree.document.localPath);
    if (file.startsWith(root + path.sep)) {
      await unlink(file).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true });
}
