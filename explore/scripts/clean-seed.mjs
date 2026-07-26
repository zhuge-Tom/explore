// 清理 E2E 种子数据。用法:node scripts/clean-seed.mjs
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ??= "file:./dev.db";
const db = new PrismaClient();

const old = await db.tree.findMany({
  where: { title: { startsWith: "[E2E种子]" } },
});
for (const t of old) await db.tree.delete({ where: { id: t.id } });

const docs = await db.document.findMany({
  where: { filename: "e2e-sample.pdf" },
});
for (const d of docs) {
  await db.document.delete({ where: { id: d.id } }).catch(() => {});
}

console.log(`cleaned ${old.length} trees, ${docs.length} docs`);
await db.$disconnect();
