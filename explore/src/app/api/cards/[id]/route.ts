import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCardDTO } from "@/lib/dto";

export const dynamic = "force-dynamic";

// GET /api/cards/:id — 卡片全文(SSE 断线后补齐用)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const card = await db.card.findUnique({ where: { id } });
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(toCardDTO(card));
}

// DELETE /api/cards/:id — 删除卡片及其整个子树(DB 级联)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const card = await db.card.findUnique({ where: { id } });
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!card.parentId) {
    return NextResponse.json(
      { error: "根卡片不能单独删除,请删除整棵树" },
      { status: 400 },
    );
  }
  await db.card.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// PATCH /api/cards/:id — 更新折叠状态
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as { collapsed?: boolean };
  const data: { collapsed?: boolean } = {};
  if (typeof body.collapsed === "boolean") data.collapsed = body.collapsed;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  try {
    const card = await db.card.update({ where: { id }, data });
    return NextResponse.json(toCardDTO(card));
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
