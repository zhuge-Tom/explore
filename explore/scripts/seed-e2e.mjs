// E2E 播种:绕开 LLM,直接向数据库写入带术语的卡片、恒星、含 PDF 的文献树。
// 输出 seed 数据的 id 到 scripts/e2e-seed.json,供 e2e.mjs 使用。
// 用法:node scripts/seed-e2e.mjs
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

process.env.DATABASE_URL ??= "file:./dev.db";
const db = new PrismaClient();

/** 生成一个最小的合法单页 PDF(xref 偏移量程序计算,pdf.js 可正常解析) */
function buildMinimalPdf(text) {
  const objects = [];
  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`,
  );
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
  objects.push(
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  );
  objects.push(
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  );

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// ---------- 清理旧种子 ----------
const old = await db.tree.findMany({
  where: { title: { startsWith: "[E2E种子]" } },
});
for (const t of old) await db.tree.delete({ where: { id: t.id } });

// ---------- 1. 普通知识树:done 根卡片(带术语)+ 子卡片 ----------
const tree = await db.tree.create({ data: { title: "[E2E种子] 量子纠缠" } });
const root = await db.card.create({
  data: {
    treeId: tree.id,
    cardType: "root",
    title: "[E2E种子] 量子纠缠",
    depth: 0,
    pathJson: "[]",
    status: "done",
    contentMd:
      "量子纠缠是两个粒子共享同一个 [[量子态|系统的完整数学描述]] 的现象。测量其中一个会立即影响另一个,这与 [[贝尔不等式|检验局域实在论的判据]] 的实验验证密切相关。",
    termsJson: JSON.stringify([
      { term: "量子态", preview: "系统的完整数学描述" },
      { term: "贝尔不等式", preview: "检验局域实在论的判据" },
    ]),
    usageJson: JSON.stringify({
      input_tokens: 500,
      output_tokens: 300,
      cache_read_input_tokens: 2000,
      cache_creation_input_tokens: 100,
    }),
  },
});
const child = await db.card.create({
  data: {
    treeId: tree.id,
    parentId: root.id,
    cardType: "child",
    sourceTerm: "量子态",
    title: "量子态",
    depth: 1,
    pathJson: JSON.stringify(["[E2E种子] 量子纠缠"]),
    status: "done",
    contentMd: "量子态是对一个量子系统的完整描述,通常用 [[波函数|概率幅的数学表示]] 表示。",
    termsJson: JSON.stringify([{ term: "波函数", preview: "概率幅的数学表示" }]),
  },
});

// ---------- 2. 恒星(两颗,树结构相连) ----------
await db.card.update({ where: { id: root.id }, data: { internalized: true } });
await db.card.update({ where: { id: child.id }, data: { internalized: true } });
const review = {
  accuracy: 9,
  completeness: 8,
  own_words: true,
  passed: true,
  praise: "抓住了非定域关联这个核心",
  gaps: [],
  hint: "",
};
const star1 = await db.star.create({
  data: {
    cardId: root.id,
    concept: "[E2E种子] 量子纠缠",
    summary: "两个粒子像一枚硬币的两面,不管离多远,翻开一面另一面就定了",
    reviewJson: JSON.stringify(review),
  },
});
await db.star.create({
  data: {
    cardId: child.id,
    concept: "量子态",
    summary: "描述一个系统所有可能测量结果的概率清单",
    reviewJson: JSON.stringify(review),
  },
});

// ---------- 3. 文献树:生成 PDF + Document + 带引用角标的根卡片 ----------
const uploadDir = path.join(process.cwd(), "uploads");
mkdirSync(uploadDir, { recursive: true });
const doc = await db.document.create({
  data: {
    filename: "e2e-sample.pdf",
    localPath: "",
    anthropicFileId: "file_e2e_fake", // UI 测试不真调 LLM,占位即可
  },
});
writeFileSync(
  path.join(uploadDir, `${doc.id}.pdf`),
  buildMinimalPdf("Hello Explore E2E"),
);
await db.document.update({
  where: { id: doc.id },
  data: { localPath: `${doc.id}.pdf` },
});
const docTree = await db.tree.create({
  data: { title: "[E2E种子] 文献树", documentId: doc.id },
});
const docRoot = await db.card.create({
  data: {
    treeId: docTree.id,
    cardType: "root",
    title: "[E2E种子] 文献树",
    depth: 0,
    pathJson: "[]",
    status: "done",
    contentMd:
      "这篇文献的核心贡献在第一页给出。[[page:1]] 其中提出了 [[测试概念|仅用于E2E]] 的框架。",
    termsJson: JSON.stringify([{ term: "测试概念", preview: "仅用于E2E" }]),
  },
});

const out = {
  treeId: tree.id,
  rootCardId: root.id,
  childCardId: child.id,
  starId: star1.id,
  docTreeId: docTree.id,
  docRootId: docRoot.id,
  documentId: doc.id,
};
writeFileSync("scripts/e2e-seed.json", JSON.stringify(out, null, 2));
console.log("seeded:", JSON.stringify(out));
await db.$disconnect();
