const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const { existsSync, mkdirSync, copyFileSync, cpSync } = require("node:fs");
const path = require("node:path");
const net = require("node:net");

let serverProcess;
const isDev = process.argv.includes("--dev");

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { const win = BrowserWindow.getAllWindows()[0]; if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}

function migrateLegacy(dataDir) {
  const targetDb = path.join(dataDir, "data", "explore.db");
  if (existsSync(targetDb)) return;
  mkdirSync(path.dirname(targetDb), { recursive: true });
  const legacy = process.env.EXPLORE_LEGACY_DIR || "G:\\111\\explore";
  const legacyDb = path.join(legacy, "prisma", "dev.db");
  const seedDb = path.join(process.resourcesPath, "seed", "explore.db");
  copyFileSync(existsSync(legacyDb) ? legacyDb : seedDb, targetDb);
  if (existsSync(path.join(legacy, "uploads"))) cpSync(path.join(legacy, "uploads"), path.join(dataDir, "uploads"), { recursive: true });
  const legacySettings = path.join(legacy, "settings.local.json");
  if (existsSync(legacySettings)) copyFileSync(legacySettings, path.join(dataDir, "settings.json"));
}

async function waitForHealth(url) {
  let last;
  for (let i = 0; i < 90; i++) {
    try { const response = await fetch(`${url}/api/health`); if (response.ok) return; last = await response.text(); } catch (e) { last = e.message; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`本地服务启动失败：${last || "超时"}`);
}

async function startServer() {
  const port = await freePort();
  const dataDir = app.getPath("userData");
  migrateLegacy(dataDir);
  const dbPath = path.join(dataDir, "data", "explore.db").replaceAll("\\", "/");
  const env = { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", EXPLORE_DATA_DIR: dataDir, DATABASE_URL: `file:${dbPath}` };
  if (isDev) {
    serverProcess = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev"], { cwd: path.resolve(__dirname, ".."), env, stdio: "inherit", windowsHide: true });
  } else {
    const server = path.join(process.resourcesPath, "app", ".next", "standalone", "server.js");
    serverProcess = spawn(process.execPath, [server], { cwd: path.dirname(server), env: { ...env, ELECTRON_RUN_AS_NODE: "1" }, stdio: "pipe", windowsHide: true });
  }
  serverProcess.on("exit", code => { if (!app.isQuitting && code) console.error(`Explore server exited: ${code}`); });
  const url = `http://127.0.0.1:${port}`;
  await waitForHealth(url);
  return url;
}

async function createWindow() {
  const url = await startServer();
  const win = new BrowserWindow({ width: 1380, height: 900, minWidth: 960, minHeight: 640, show: false, backgroundColor: "#0f1117", webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url: target }) => { if (!target.startsWith(url)) shell.openExternal(target); return { action: "deny" }; });
  win.webContents.on("will-navigate", (event, target) => { if (!target.startsWith(url)) { event.preventDefault(); shell.openExternal(target); } });
  await win.loadURL(url); win.show();
}

app.whenReady().then(createWindow).catch(error => { console.error(error); app.quit(); });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { app.isQuitting = true; if (serverProcess && !serverProcess.killed) serverProcess.kill(); });
