import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_SIZE = 32 * 1024 * 1024; // Claude PDF 请求上限 32MB

// POST /api/documents — 上传 PDF(multipart),存本地 + Anthropic Files API
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "仅支持 PDF" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "文件超过 32MB 上限" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  const doc = await db.document.create({
    data: { filename: file.name, localPath: "" },
  });

  // 本地保存(pdf.js 阅读器用)
  await mkdir(UPLOAD_DIR, { recursive: true });
  const localName = `${doc.id}.pdf`;
  await writeFile(path.join(UPLOAD_DIR, localName), buf);

  // 上传 Anthropic Files API(卡片生成引用用,一次上传永久复用)
  try {
    const client = new Anthropic();
    const uploaded = await client.beta.files.upload({
      file: await toFile(buf, file.name, { type: "application/pdf" }),
      betas: ["files-api-2025-04-14"],
    });
    await db.document.update({
      where: { id: doc.id },
      data: { localPath: localName, anthropicFileId: uploaded.id },
    });
  } catch (e) {
    await db.document.update({
      where: { id: doc.id },
      data: { localPath: localName, status: "error" },
    });
    return NextResponse.json(
      {
        error: `文献已保存,但上传到 Claude 失败:${e instanceof Error ? e.message : "未知错误"}`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ documentId: doc.id, filename: file.name });
}
