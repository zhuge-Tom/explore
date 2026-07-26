import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toTreeDTO } from "@/lib/dto";

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
  try {
    await db.tree.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
