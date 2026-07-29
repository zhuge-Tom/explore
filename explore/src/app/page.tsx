import Link from "next/link";
import { db } from "@/lib/db";
import { todayUsage } from "@/lib/limits";
import { NewTreeForm } from "@/components/NewTreeForm";
import { DocumentForm } from "@/components/DocumentForm";
import { TreeList } from "@/components/TreeList";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default async function HomePage() {
  const [trees, starCount, usage] = await Promise.all([
    db.tree.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { cards: true } }, document: true },
    }),
    db.star.count(),
    todayUsage(),
  ]);

  return (
    <main className="home">
      <div className="home-head">
        <div>
          <h1>Explore 🌲</h1>
          <p className="tagline">哪里不懂点哪里 —— 让知识长成一棵树</p>
        </div>
        <Link href="/universe" className="universe-link">
          🌌 思维宇宙
          <span className="star-count">{starCount} ★</span>
        </Link>
      </div>

      <NewTreeForm />
      <DocumentForm />

      {usage.cards > 0 && (
        <p className="usage-dashboard">
          今日 {usage.cards}/{usage.limit} 张卡片 · 输入 {fmt(usage.totalInput)}{" "}
          / 输出 {fmt(usage.output)} tokens · 缓存命中 {usage.cachePct}% · 约 $
          {usage.costUSD}
        </p>
      )}

      {trees.length === 0 && (
        <div className="empty-guide">
          <p>👋 第一次来?试试这样开始:</p>
          <p>1️⃣ 在上面输入一个你一直想弄懂的问题(或导入一篇 PDF 论文)</p>
          <p>2️⃣ 卡片里看不懂的术语会高亮 —— 哪里不懂点哪里,知识树自己长出来</p>
          <p>3️⃣ 弄懂一个概念后点「✍️ 总结」,通过 AI 评审就能点亮你的第一颗恒星 🌟</p>
        </div>
      )}

      <TreeList
        initial={trees.map((t) => ({
          id: t.id,
          title: t.title,
          cardCount: t._count.cards,
          documentName: t.document?.filename ?? null,
        }))}
      />
    </main>
  );
}
