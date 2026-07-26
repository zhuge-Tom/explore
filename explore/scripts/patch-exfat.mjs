// exFAT 兼容补丁:exFAT 上对普通文件调用 readlink 返回 EISDIR(NTFS 为 EINVAL),
// Next.js 的构建追踪代码只豁免 EINVAL/ENOENT/UNKNOWN,遇到 EISDIR 会让构建崩溃。
// 本脚本把 EISDIR 加入豁免列表(exFAT 不支持符号链接,等价于"不是符号链接")。
// 挂在 postinstall 上,每次 npm install 后自动重打。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  "node_modules/next/dist/build/webpack/plugins/next-trace-entrypoints-plugin.js",
  "node_modules/next/dist/esm/build/webpack/plugins/next-trace-entrypoints-plugin.js",
  "node_modules/next/dist/build/collect-build-traces.js",
  "node_modules/next/dist/esm/build/collect-build-traces.js",
];

const FROM = "e.code === 'EINVAL' || e.code === 'ENOENT'";
const TO = "e.code === 'EINVAL' || e.code === 'EISDIR' || e.code === 'ENOENT'";

let patched = 0;
for (const rel of targets) {
  const file = join(root, rel);
  if (!existsSync(file)) continue;
  const src = readFileSync(file, "utf8");
  if (src.includes(TO)) continue; // 已打过
  if (!src.includes(FROM)) {
    console.warn(`[patch-exfat] 未找到目标代码,Next 版本可能已变化: ${rel}`);
    continue;
  }
  writeFileSync(file, src.replaceAll(FROM, TO));
  patched++;
}
console.log(`[patch-exfat] 完成,修改 ${patched} 个文件`);
