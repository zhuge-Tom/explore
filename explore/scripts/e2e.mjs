// 浏览器端到端测试(无 API Key 也能跑:验证 UI 渲染与错误路径)
// 前置:dev 服务器已在 localhost:3000 运行。用法:node scripts/e2e.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const results = [];
const pageErrors = [];
const consoleErrors = [];
let treeId = null;

function ok(name) {
  results.push(`✓ ${name}`);
}
function fail(name, detail) {
  results.push(`✗ ${name} — ${detail}`);
  process.exitCode = 1;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  const text = m.text();
  if (m.type() === "error" && !/favicon|404 \(Not Found\)/.test(text)) {
    consoleErrors.push(text.slice(0, 300));
  }
});

try {
  // ---------- 1. 首页 ----------
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  (await page.locator("h1", { hasText: "Explore" }).count()) > 0
    ? ok("首页渲染,标题存在")
    : fail("首页渲染", "未找到 h1");

  // ---------- 2. 建树(UI 操作) ----------
  await page.fill("textarea", "E2E 测试:什么是拉格朗日力学?");
  await page.click(".new-tree button.primary");
  await page.waitForURL("**/tree/**", { timeout: 30000 });
  treeId = page.url().split("/tree/")[1];
  ok("提交问题 → 跳转画布页");

  // ---------- 3. 画布与根卡片 ----------
  await page.waitForSelector(".react-flow", { timeout: 30000 });
  ok("React Flow 画布挂载");
  await page.waitForSelector(".card-node", { timeout: 30000 });
  ok("根卡片节点渲染");

  // 无 Key:等待卡片进入 error 态并出现友好提示与重试按钮
  await page.waitForSelector(".card-node.error, .card-node.done", {
    timeout: 90000,
  });
  const isError = (await page.locator(".card-node.error").count()) > 0;
  if (isError) {
    ok("无 Key 时卡片进入 error 态(预期)");
    (await page.locator(".retry-btn").count()) > 0
      ? ok("重试按钮存在")
      : fail("重试按钮", "未找到 .retry-btn");
  } else {
    ok("卡片生成完成(检测到可用 Key)");
  }

  // 面包屑/导出/宇宙入口
  (await page.locator('a[href$="/export"]').count()) > 0
    ? ok("导出按钮存在")
    : fail("导出按钮", "未找到");

  // ---------- 4. 小地图与控制条 ----------
  (await page.locator(".react-flow__minimap").count()) > 0
    ? ok("小地图渲染")
    : fail("小地图", "未找到");

  // ---------- 5. 思维宇宙页 ----------
  await page.goto(`${BASE}/universe`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForSelector(".universe-empty, canvas", { timeout: 45000 });
  ok("宇宙页渲染(空状态或 3D 画布)");

  // ---------- 6. 首页树列表与删除 ----------
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  (await page.locator(".tree-list a").count()) > 0
    ? ok("树列表显示新建的树")
    : fail("树列表", "为空");

  await page.screenshot({
    path: "scripts/e2e-home.png",
    fullPage: true,
  });
} catch (e) {
  fail("流程中断", e instanceof Error ? e.message.slice(0, 300) : String(e));
  try {
    await page.screenshot({ path: "scripts/e2e-failure.png", fullPage: true });
  } catch {}
} finally {
  // 清理测试树
  if (treeId) {
    try {
      await fetch(`${BASE}/api/trees/${treeId}`, { method: "DELETE" });
      ok("清理测试树");
    } catch {
      results.push("… 清理失败(不影响测试结论)");
    }
  }
  await browser.close();
}

console.log("\n===== E2E 结果 =====");
for (const r of results) console.log(r);
if (pageErrors.length) {
  process.exitCode = 1;
  console.log("\n----- 未捕获页面异常(致命)-----");
  for (const e of pageErrors) console.log("  " + e);
} else {
  console.log("\n✓ 无未捕获页面异常");
}
if (consoleErrors.length) {
  console.log("\n----- console.error(供参考)-----");
  for (const e of [...new Set(consoleErrors)].slice(0, 10))
    console.log("  " + e);
}
