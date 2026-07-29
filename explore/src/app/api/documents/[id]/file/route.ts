import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { uploadsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/documents/:id/file — 前端 pdf.js 渲染用的原件
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || !doc.localPath) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const buf = await readFile(path.join(uploadsDir(), doc.localPath));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
}
