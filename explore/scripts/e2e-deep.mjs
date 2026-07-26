// 深度 E2E:基于播种数据测试全部核心交互(不依赖 LLM)。
// 前置:dev 服务器已运行 + 已执行 node scripts/seed-e2e.mjs
// 用法:node scripts/e2e-deep.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const seed = JSON.parse(readFileSync("scripts/e2e-seed.json", "utf8"));
const results = [];
const pageErrors = [];

function ok(name) {
  results.push(`✓ ${name}`);
}
function fail(name, detail) {
  results.push(`✗ ${name} — ${detail}`);
  process.exitCode = 1;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 300)));

try {
  // ========== A. 知识树画布交互 ==========
  await page.goto(`${BASE}/tree/${seed.treeId}`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForSelector(".card-node", { timeout: 30000 });
  const nodeCount = await page.locator(".card-node").count();
  nodeCount === 2
    ? ok("画布渲染 2 张种子卡片")
    : fail("卡片数量", `期望2,实际${nodeCount}`);

  // A1. 术语高亮渲染
  const termLinks = await page.locator(".term-link").count();
  termLinks >= 3
    ? ok(`术语高亮渲染(${termLinks} 个可点击术语)`)
    : fail("术语高亮", `仅 ${termLinks} 个`);

  // A2. 用量徽标(缓存命中率)
  const usageText = await page.locator(".usage-badge").first().textContent();
  usageText?.includes("缓存")
    ? ok(`用量徽标显示:${usageText.trim()}`)
    : fail("用量徽标", usageText ?? "未找到");

  // A3. 点击已有同名术语 → 去重跳转(不新建卡片)
  await page
    .locator(".term-link", { hasText: "量子态" })
    .first()
    .click();
  await page.waitForTimeout(1500);
  const afterDedup = await page.locator(".card-node").count();
  afterDedup === 2
    ? ok("点击已存在术语 → 去重跳转,未新建卡片")
    : fail("去重跳转", `卡片数变为 ${afterDedup}`);

  // A4. 点击新术语 → 新建卡片(无 Key 会进入 error 态,但节点必须出现)
  await page.locator(".term-link", { hasText: "贝尔不等式" }).first().click();
  await page.waitForSelector(".card-node:nth-child(3), .react-flow__node:nth-child(3)", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const afterCreate = await page.locator(".card-node").count();
  afterCreate === 3
    ? ok("点击新术语 → 新卡片节点出现")
    : fail("新建卡片", `卡片数 ${afterCreate},期望 3`);

  // A5. 面包屑
  const crumb = await page.locator(".crumb").first().textContent();
  crumb?.includes("量子纠缠")
    ? ok("面包屑路径渲染")
    : fail("面包屑", crumb ?? "未找到");

  // A6. 总结弹窗开合
  await page.locator(".action-btn", { hasText: "总结" }).first().click();
  await page.waitForSelector(".modal-textarea", { timeout: 5000 });
  ok("总结弹窗打开");
  await page.locator(".modal-close").click();
  await page.waitForSelector(".modal-textarea", { state: "detached", timeout: 5000 });
  ok("总结弹窗关闭");

  // A7. 对比输入弹窗
  await page.locator(".action-btn", { hasText: "对比" }).first().click();
  await page.waitForSelector(".modal-input", { timeout: 5000 });
  ok("对比输入弹窗打开");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".modal-input", { state: "detached", timeout: 5000 });
  ok("Esc 关闭输入弹窗");

  // A8. 折叠子树
  const collapseBtn = page.locator(".action-btn", { hasText: "折叠" }).first();
  await collapseBtn.click();
  await page.waitForTimeout(800);
  const afterCollapse = await page.locator(".card-node").count();
  afterCollapse < afterCreate
    ? ok(`折叠子树生效(${afterCreate} → ${afterCollapse} 张可见)`)
    : fail("折叠", `卡片数未减少 (${afterCollapse})`);
  await page.locator(".action-btn", { hasText: "▸" }).first().click();
  await page.waitForTimeout(800);
  ok("展开子树");

  // A9. 导出内容正确性
  const exportRes = await page.request.get(
    `${BASE}/api/trees/${seed.treeId}/export`,
  );
  const md = await exportRes.text();
  md.includes("**量子态**") && md.includes("# [E2E种子] 量子纠缠") && md.includes("⭐")
    ? ok("导出 Markdown:标题/加粗术语/⭐ 标记齐全")
    : fail("导出内容", md.slice(0, 150));

  // ========== B. 文献树:PDF 双栏 ==========
  await page.goto(`${BASE}/tree/${seed.docTreeId}`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForSelector(".pdf-pane", { timeout: 30000 });
  ok("双栏模式:PDF 面板挂载");
  await page.waitForSelector(".react-pdf__Page canvas", { timeout: 45000 });
  ok("pdf.js 渲染出页面 canvas(worker 正常)");

  // B1. 引用角标渲染与点击
  const cite = page.locator(".cite-badge").first();
  (await cite.count()) > 0 ? ok("引用角标 p.1 渲染") : fail("引用角标", "未找到");
  await cite.click();
  await page.waitForTimeout(600);
  ok("点击引用角标无异常(滚动到对应页)");

  // ========== C. 思维宇宙(有恒星) ==========
  await page.goto(`${BASE}/universe`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForSelector("canvas", { timeout: 45000 });
  ok("3D 宇宙 canvas 渲染(WebGL 正常)");
  const headText = await page.locator("h1").textContent();
  headText?.includes("2") ? ok("恒星计数显示 2 颗") : fail("恒星计数", headText ?? "");

  await page.screenshot({ path: "scripts/e2e-universe.png" });
} catch (e) {
  fail("流程中断", e instanceof Error ? e.message.slice(0, 300) : String(e));
  try {
    await page.screenshot({ path: "scripts/e2e-deep-failure.png", fullPage: true });
  } catch {}
} finally {
  await browser.close();
}

console.log("\n===== 深度 E2E 结果 =====");
for (const r of results) console.log(r);
if (pageErrors.length) {
  process.exitCode = 1;
  console.log("\n----- 未捕获页面异常(致命)-----");
  for (const e of [...new Set(pageErrors)]) console.log("  " + e);
} else {
  console.log("\n✓ 无未捕获页面异常");
}
