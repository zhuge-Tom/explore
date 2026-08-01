import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { uploadsDir } from "@/lib/paths";
import type { ImageAttachment } from "@/lib/image-attachments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024;
const MIME_TYPES = new Set<ImageAttachment["mimeType"]>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择图片文件" }, { status: 400 });
  }
  if (!MIME_TYPES.has(file.type as ImageAttachment["mimeType"])) {
    return NextResponse.json({ error: "仅支持 JPG、PNG、WebP 或 GIF 图片" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_SIZE) {
    return NextResponse.json({ error: "单张图片大小需在 10MB 以内" }, { status: 400 });
  }

  const id = randomUUID();
  const localPath = `images/${id}.bin`;
  const target = path.join(uploadsDir(), localPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));

  const image: ImageAttachment = {
    id,
    name: file.name || "图片",
    mimeType: file.type as ImageAttachment["mimeType"],
    localPath,
  };
  return NextResponse.json({ image });
}
