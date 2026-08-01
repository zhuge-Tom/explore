import { NextResponse } from "next/server";
import { testConnection, ProviderError } from "@/lib/llm/gateway";
import type { CredentialScope, ProviderKind } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json() as { kind: ProviderKind; baseUrl: string; apiKey?: string; model?: string; scope?: CredentialScope };
  try {
    const models = await testConnection(body);
    return NextResponse.json({ ok: true, models });
  } catch (e) {
    const info = e instanceof ProviderError ? e.info : { code: "server", message: e instanceof Error ? e.message : "连接失败" };
    return NextResponse.json({ ok: false, error: info }, { status: info.code === "network" ? 503 : 400 });
  }
}
