import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { testApiKey } from "@/lib/llm/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/settings/test — 测试连接。body 可带 {key}(测试未保存的输入),不带则测已保存的
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { key?: string };
  const key = body.key?.trim() || getSettings().anthropicApiKey;
  if (!key) {
    return NextResponse.json({ ok: false, error: "尚未填写 Key" });
  }
  const err = await testApiKey(key);
  return NextResponse.json(err ? { ok: false, error: err } : { ok: true });
}
