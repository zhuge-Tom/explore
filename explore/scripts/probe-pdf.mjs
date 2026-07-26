// 诊断探针:抓取文献树页面的完整错误堆栈与控制台输出
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const seed = JSON.parse(readFileSync("scripts/e2e-seed.json", "utf8"));

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => {
  console.log("=== PAGEERROR ===");
  console.log(e.stack ?? e.message);
});
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    console.log(`[console.${m.type()}]`, m.text().slice(0, 500));
  }
});
page.on("requestfailed", (r) => {
  console.log("[requestfailed]", r.url().slice(0, 150), r.failure()?.errorText);
});

await page.goto(`${BASE}/tree/${seed.docTreeId}`, {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.waitForTimeout(8000);
console.log("pdf-pane count:", await page.locator(".pdf-pane").count());
console.log(
  "react-pdf Document count:",
  await page.locator(".react-pdf__Document").count(),
);
await browser.close();
