import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { uploadsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_SIZE = 32 * 1024 * 1024;
const MAX_TEXT = 600_000;

async function extractPdfText(buf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages: string[] = [];
  let length = 0;
  for (let number = 1; number <= pdf.numPages && length < MAX_TEXT; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const text = content.items.map(item => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
    if (text) { const marked = `[[page:${number}]]\n${text}`; pages.push(marked); length += marked.length; }
  }
  return pages.join("\n\n").slice(0, MAX_TEXT);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择 PDF 文件" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "仅支持 PDF" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "文件超过 32MB 上限" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const doc = await db.document.create({ data: { filename: file.name, localPath: "", status: "ready" } });
  const localName = `${doc.id}.pdf`;
  await writeFile(path.join(uploadsDir(), localName), buf);
  try {
    const textContent = await extractPdfText(buf);
    if (!textContent.trim()) {
      await db.document.update({ where: { id: doc.id }, data: { localPath: localName, status: "error" } });
      return NextResponse.json({ error: "PDF 没有可提取的文字。扫描型 PDF 暂不支持，请先进行 OCR。" }, { status: 422 });
    }
    await db.document.update({ where: { id: doc.id }, data: { localPath: localName, textContent } });
    return NextResponse.json({ documentId: doc.id, filename: file.name });
  } catch (e) {
    await db.document.update({ where: { id: doc.id }, data: { localPath: localName, status: "error" } });
    return NextResponse.json({ error: `PDF 解析失败：${e instanceof Error ? e.message : "未知错误"}` }, { status: 422 });
  }
}
