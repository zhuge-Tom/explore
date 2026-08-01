import { NextResponse } from "next/server";
import { publicSettings, saveSettings, type ProviderKind } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() { return NextResponse.json(await publicSettings()); }

export async function PUT(req: Request) {
  try {
    const body = await req.json() as {
      activeProvider?: ProviderKind;
      provider?: { kind: ProviderKind; baseUrl?: string; model?: string; apiKey?: string; clearApiKey?: boolean };
      vision?: {
        activeProvider?: ProviderKind;
        provider?: { kind: ProviderKind; baseUrl?: string; model?: string; apiKey?: string; clearApiKey?: boolean };
      };
      dailyCardLimit?: number;
      maxConcurrent?: number;
    };
    await saveSettings(body);
    return NextResponse.json({ ok: true, ...(await publicSettings()) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存失败" }, { status: 400 });
  }
}
