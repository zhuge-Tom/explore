import { NextResponse } from "next/server";
import { getSettings, saveSettings, maskKey } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/settings — 当前配置(Key 只回掩码)
export async function GET() {
  const s = getSettings();
  return NextResponse.json({
    anthropicApiKey: maskKey(s.anthropicApiKey),
    voyageApiKey: maskKey(s.voyageApiKey),
    dailyCardLimit: s.dailyCardLimit,
    maxConcurrent: s.maxConcurrent,
  });
}

// POST /api/settings — 保存配置(即时生效)
export async function POST(req: Request) {
  const body = (await req.json()) as {
    anthropicApiKey?: string | null;
    voyageApiKey?: string | null;
    dailyCardLimit?: number;
    maxConcurrent?: number;
  };

  if (
    body.anthropicApiKey &&
    !/^sk-ant-[A-Za-z0-9_-]{10,}$/.test(body.anthropicApiKey.trim())
  ) {
    return NextResponse.json(
      { error: "Key 格式不对:应以 sk-ant- 开头" },
      { status: 400 },
    );
  }

  saveSettings(body);
  const s = getSettings();
  return NextResponse.json({
    ok: true,
    anthropicApiKey: maskKey(s.anthropicApiKey),
    voyageApiKey: maskKey(s.voyageApiKey),
    dailyCardLimit: s.dailyCardLimit,
    maxConcurrent: s.maxConcurrent,
  });
}
