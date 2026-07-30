import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { toTreeDTO } from "@/lib/dto";
import { TreeWorkspace } from "@/components/TreeWorkspace";
import { DeleteTreeButton } from "@/components/DeleteTreeButton";

export const dynamic = "force-dynamic";

export default async function TreePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tree = await db.tree.findUnique({
    where: { id },
    include: { cards: { orderBy: { createdAt: "asc" } }, document: true },
  });
  if (!tree) notFound();

  return (
    <div className="canvas-page">
      <header className="canvas-header">
        <Link href="/">← 返回</Link>
        <h1>{tree.title}</h1>
        <div className="canvas-header-actions">
          <a
            href={`/api/trees/${tree.id}/export`}
            title="导出整棵树为 Markdown 学习笔记"
          >
            导出
          </a>
          <Link href="/universe">思维宇宙</Link>
          <DeleteTreeButton treeId={tree.id} treeTitle={tree.title} redirectToHome />
        </div>
      </header>
      <div className="canvas-wrap">
        <TreeWorkspace tree={toTreeDTO(tree)} />
      </div>
    </div>
  );
}
