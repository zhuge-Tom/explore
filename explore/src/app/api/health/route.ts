import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.$executeRawUnsafe("ALTER TABLE Document ADD COLUMN textContent TEXT").catch(() => {});
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  }
  catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}
