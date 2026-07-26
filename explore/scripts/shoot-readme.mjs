// 为 README 拍摄产品截图(自带干净数据,拍完自动清理)。需 dev 服务器运行。
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

process.env.DATABASE_URL ??= "file:./dev.db";
const db = new PrismaClient();
const BASE = "http://localhost:3000";
mkdirSync("../docs/screenshots", { recursive: true });

const usage = JSON.stringify({
  input_tokens: 480,
  output_tokens: 310,
  cache_read_input_tokens: 2600,
  cache_creation_input_tokens: 90,
});

// ---------- 数据 ----------
const tree = await db.tree.create({ data: { title: "什么是量子纠缠?" } });
const root = await db.card.create({
  data: {
    treeId: tree.id, cardType: "root", title: "什么是量子纠缠?", depth: 0,
    pathJson: "[]", status: "done", internalized: true, usageJson: usage,
    contentMd:
      "量子纠缠是两个或多个粒子共享同一个 [[量子态|系统的完整数学描述]] 的现象:无论相隔多远,测量其中一个粒子会立即决定另一个的测量结果。\n\n这种关联无法用经典概率解释——[[贝尔不等式|检验局域实在论的判据]] 的实验违背证明了这一点。",
    termsJson: JSON.stringify([
      { term: "量子态", preview: "系统的完整数学描述" },
      { term: "贝尔不等式", preview: "检验局域实在论的判据" },
    ]),
  },
});
const child1 = await db.card.create({
  data: {
    treeId: tree.id, parentId: root.id, cardType: "child", sourceTerm: "量子态",
    title: "量子态", depth: 1, pathJson: JSON.stringify(["什么是量子纠缠?"]),
    status: "done", internalized: true, usageJson: usage,
    contentMd:
      "量子态是对一个量子系统的完整描述,通常用 [[波函数|概率幅的数学表示]] 表示。它并不直接告诉你测量结果,而是给出所有可能结果的概率分布。",
    termsJson: JSON.stringify([{ term: "波函数", preview: "概率幅的数学表示" }]),
  },
});
await db.card.create({
  data: {
    treeId: tree.id, parentId: root.id, cardType: "related", sourceTerm: "经典关联",
    title: "经典关联 vs 什么是量子纠缠?", depth: 1,
    pathJson: JSON.stringify(["什么是量子纠缠?"]), status: "done", usageJson: usage,
    contentMd:
      "经典关联像一副手套:分开装进两个盒子,打开一个看到左手,另一个必是右手——但结果早已注定。纠缠则不同,测量前结果并不存在,是测量本身让两端同时「决定」。",
    termsJson: "[]",
  },
});
await db.card.create({
  data: {
    treeId: tree.id, parentId: child1.id, cardType: "child", sourceTerm: "波函数",
    title: "波函数", depth: 2,
    pathJson: JSON.stringify(["什么是量子纠缠?", "量子态"]), status: "done", usageJson: usage,
    contentMd:
      "波函数把系统的每个可能状态映射为一个复数(概率幅),其模平方给出测量到该状态的概率。",
    termsJson: "[]",
  },
});

const review = JSON.stringify({
  accuracy: 9, completeness: 8, own_words: true, passed: true,
  praise: "抓住了非定域关联这个核心", gaps: [], hint: "",
});
const s1 = await db.star.create({
  data: { cardId: root.id, concept: "量子纠缠",
    summary: "像一枚硬币的两面,不管离多远,翻开一面另一面就定了", reviewJson: review },
});
const s2 = await db.star.create({
  data: { cardId: child1.id, concept: "量子态",
    summary: "描述一个系统所有可能测量结果的概率清单", reviewJson: review },
});

// 文献树
function buildMinimalPdf(lines) {
  const content = lines
    .map((t, i) => `BT /F1 ${i === 0 ? 18 : 12} Tf 60 ${700 - i * 30} Td (${t}) Tj ET`)
    .join("\n");
  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const o of objects) { offsets.push(pdf.length); pdf += o; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
const uploadDir = path.join(process.cwd(), "uploads");
mkdirSync(uploadDir, { recursive: true });
const doc = await db.document.create({
  data: { filename: "attention-is-all-you-need.pdf", localPath: "", anthropicFileId: "file_shoot" },
});
writeFileSync(path.join(uploadDir, `${doc.id}.pdf`), buildMinimalPdf([
  "Attention Is All You Need",
  "",
  "The dominant sequence transduction models are based on",
  "complex recurrent or convolutional neural networks.",
  "We propose a new simple architecture, the Transformer,",
  "based solely on attention mechanisms.",
]));
await db.document.update({ where: { id: doc.id }, data: { localPath: `${doc.id}.pdf` } });
const docTree = await db.tree.create({
  data: { title: "读懂 Transformer 论文", documentId: doc.id },
});
await db.card.create({
  data: {
    treeId: docTree.id, cardType: "root", title: "读懂 Transformer 论文", depth: 0,
    pathJson: "[]", status: "done", usageJson: usage,
    contentMd:
      "这篇论文提出了完全基于 [[注意力机制|按相关性加权聚合信息]] 的 Transformer 架构,摒弃了循环与卷积。[[page:1]] 其核心创新是 [[自注意力|序列内部元素两两计算相关性]],让模型并行处理整个序列。",
    termsJson: JSON.stringify([
      { term: "注意力机制", preview: "按相关性加权聚合信息" },
      { term: "自注意力", preview: "序列内部元素两两计算相关性" },
    ]),
  },
});

// ---------- 拍摄 ----------
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });

await page.goto(`${BASE}/tree/${tree.id}`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector(".card-node", { timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: "../docs/screenshots/canvas.png" });
console.log("canvas.png ✓");

await page.goto(`${BASE}/tree/${docTree.id}`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector(".react-pdf__Page canvas", { timeout: 45000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "../docs/screenshots/pdf-mode.png" });
console.log("pdf-mode.png ✓");

await page.goto(`${BASE}/universe`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector("canvas", { timeout: 45000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: "../docs/screenshots/universe.png" });
console.log("universe.png ✓");

await browser.close();

// ---------- 清理 ----------
await db.star.deleteMany({ where: { id: { in: [s1.id, s2.id] } } });
await db.tree.delete({ where: { id: tree.id } });
await db.tree.delete({ where: { id: docTree.id } });
await db.document.delete({ where: { id: doc.id } });
console.log("已清理拍摄数据");
await db.$disconnect();
