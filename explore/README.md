# Explore

Explore 是一款面向 Windows 的 AI 知识探索桌面应用。输入一个问题或导入带文本层的 PDF，应用会把知识拆成可继续追问、拖动、缩放和整理的卡片，并以知识树和思维宇宙呈现。

## 主要功能

- 知识卡片流式生成，点击术语继续深入。
- 卡片可整体拖动、从四条边和四个角调整大小，也可折叠或隐藏。
- 星空画布、缩放、全图适配和可开关的缩略图。
- 导入 PDF 后按页提取文本，回答使用 `[[page:N]]` 页码引用。
- 支持总结评审、对比卡片、追问分支、Markdown 导出和思维宇宙。
- 支持 DeepSeek、Anthropic 和自定义 OpenAI Chat Completions 兼容服务。
- 设置入口位于右上角；API Key 不会显示在页面或通过设置接口回传。

## Windows 安装

从仓库的 [Releases](https://github.com/zhuge-Tom/explore/releases) 页面下载最新版 `Explore Setup x.y.z.exe`，双击后按提示选择安装目录。安装程序会创建桌面和开始菜单快捷方式。

首次启动时，点击右上角设置按钮：

1. 选择模型渠道。
2. 输入 API Key。
3. 选择或填写模型名称。
4. 点击“保存并测试”。

应用数据保存在当前 Windows 用户的数据目录中：

```text
%APPDATA%\Explore
```

这里包含数据库、上传文档、日志和非敏感设置。卸载或升级程序不会自动删除知识数据。

## 本地开发

需要 Node.js 22 和 npm。

```powershell
cd explore
npm install
npm run db:push
npm run dev
```

开发页面默认位于 <http://localhost:3000>。也可以运行纯 ASCII 的开发启动脚本：

```powershell
.\start.bat
```

## 构建 Windows 安装包

在 Windows x64 环境中执行：

```powershell
cd explore
npm ci
npm run desktop:build
```

安装包输出到：

```text
explore\dist\Explore Setup 0.1.0.exe
```

桌面版由 Electron 启动本地 Next.js standalone 服务，只监听随机的 `127.0.0.1` 端口，不需要用户另开浏览器。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run db:push` | 初始化或更新 SQLite 数据库 |
| `npm run e2e` | 基础端到端测试 |
| `npm run e2e:deep` | 深度端到端测试 |
| `npm run desktop:dev` | Electron 开发模式 |
| `npm run desktop:build` | 构建 Windows NSIS 安装包 |

## 项目结构

```text
electron/                 Electron 主进程
prisma/                   SQLite 数据模型
scripts/                  构建、数据库与 E2E 脚本
src/app/                  Next.js 页面和 API
src/components/           卡片、画布、设置及 PDF 界面
src/lib/llm/              多模型 Provider 网关
src/lib/paths.ts          桌面数据目录
```

## 数据与隐私

- 仓库和安装包不包含 API Key、个人数据库或上传的 PDF。
- API Key 通过桌面安全存储保存；设置 API 只返回 `hasApiKey`。
- PDF 首版不包含 OCR。扫描型 PDF 没有文本层时，应用会提示更换文件。
- 当前版本不提供云同步、登录、多设备共享或自动更新。

## CI 状态说明

GitHub Actions workflow 位于 `.github/workflows/ci.yml`。如果任务在没有任何步骤执行的情况下立即失败，请先检查 GitHub 账户 Billing/Actions 状态；这类账户级锁定与项目构建结果无关。
