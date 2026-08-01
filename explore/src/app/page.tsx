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
          <h1>Explore</h1>
          <p className="tagline">让知识长成一棵树</p>
        </div>
        <Link href="/universe" className="universe-link">
          思维宇宙
          <span className="star-count">{starCount} 颗恒星</span>
        </Link>
      </div>

      <NewTreeForm />
      <DocumentForm />

      {usage.cards > 0 && (
        <p className="usage-dashboard">
          今日 {usage.cards}/{usage.limit} 张卡片 · 输入 {fmt(usage.totalInput)} / 输出 {fmt(usage.output)} tokens · 缓存命中 {usage.cachePct}% · 约 ${usage.costUSD}
        </p>
      )}

      {trees.length === 0 && (
        <div className="empty-guide">
          <p>从一个问题开始</p>
          <p>输入问题、添加图片，或导入 PDF 文献；Explore 会生成可继续展开、对比和追问的知识卡片。</p>
        </div>
      )}

      <TreeList
        initial={trees.map((tree) => ({
          id: tree.id,
          title: tree.title,
          cardCount: tree._count.cards,
          documentName: tree.document?.filename ?? null,
        }))}
      />
    </main>
  );
}
