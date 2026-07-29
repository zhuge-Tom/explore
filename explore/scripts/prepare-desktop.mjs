import { cp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
await rm("desktop-assets", { recursive: true, force: true });
await mkdir("desktop-assets", { recursive: true });
await cp("prisma/dev.db", "desktop-assets/explore-empty.db");
const result = spawnSync(process.execPath, ["scripts/empty-desktop-db.mjs"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: "file:../desktop-assets/explore-empty.db" },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
