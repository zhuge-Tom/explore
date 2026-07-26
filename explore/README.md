# Explore — 完整产品(M1 + M2 + M3)

对应设计文档见上级目录 `G:\111\*.md`(产品设计 / 架构 / 数据模型 / LLM 工程 / 路线图)。

## 功能清单

**M1 · 核心闭环**
- 新建知识树 → 根卡片**流式生成**(SSE,逐字渲染);
- 正文 `[[术语|预览]]` 自动高亮,**点击术语 → 派生子卡片**,dagre 自动布局;
- 面包屑路径、同名卡片去重跳转、断线补齐、失败重试、refusal 友好降级。

**M2 · 文献与卡片体系**
- **PDF 文献导入**:本地保存 + Anthropic Files API 一次上传永久复用;
- **双栏模式**:左侧 pdf.js 原文阅读器,右侧卡片画布;**划词直接提问**;
- 卡片回答带 **citations 页码角标**(`[[page:N]]` → `p.N`),点击滚动回原文对应页;
- **↔ 对比卡片**(横向辨析)与 **⑂ 分支卡片**(继承上下文另起炉灶);
- 子树**折叠**(带隐藏计数徽标)、**双击聚焦**卡片。

**完善轮(M3 后追加)**
- 📥 **整树导出 Markdown**(层级标题、术语加粗、引用页码、⭐ 标记)——树页头部按钮;
- 🔄 **卡片重新生成**(不吃每日配额,吃并发额度);🗑 删除树/卡片(DB 级联);
- **成本保护**:每日配额(默认 50)+ 并发限 3(僵尸卡片 10 分钟后不占额度),`.env` 可调;
- **首页用量看板**(今日卡片/tokens/缓存命中率/估算成本)+ 卡片用量徽标;
- **性能**:流式渲染 80ms 节流、dagre 布局仅结构变化时重算、拖拽位置持久保留;
- **体验**:新卡片镜头跟随、Esc 全景、树列表搜索、空状态引导、无 Key 首跑友好报错;
- **复习闭环(轻量)**:重复总结同一卡片会刷新恒星而非产生重复;恒星面板超 7 天提示复习;
- `start.bat` 一键启动(自动装依赖/建库/备份数据库保留 7 份/开浏览器)。

**M3 · 思维宇宙**
- 「✍️ 总结」:用自己的话写理解 → **结构化 AI 评审**(准确性/完整性/是否自己的话);
- 通过 → 恒星入库,卡片打 ⭐;未通过 → 指出具体偏差(给线索不给答案),可修改重交;
- **3D 宇宙页**(`/universe`):力导向图,树结构连线 + 语义连线(需 Voyage),点击恒星回看;
- **知识锚点教学**:生成新卡片时检索你已内化的相关理解,让 AI 用"你自己的话"做类比
  (需 `VOYAGE_API_KEY`,未配置时自动关闭,其余功能不受影响)。

## 快速开始

```bash
cd explore
npm install            # 自动执行 prisma generate + exFAT 补丁
# 编辑 .env,填入 ANTHROPIC_API_KEY(VOYAGE_API_KEY 可选)
npm run db:push        # 创建/迁移 SQLite 数据库
npm run dev            # http://localhost:3000
```

## 目录结构

```
src/
  app/
    page.tsx                      首页:问题/文献两种入口 + 树列表
    tree/[id]/page.tsx            工作区(纯画布 或 PDF+画布双栏)
    universe/page.tsx             3D 思维宇宙
    api/
      trees/…                     建树 / 整树加载
      cards/…                     派生卡片(child/related/branch)、PATCH 折叠、SSE 流式生成
      documents/…                 PDF 上传 / 原件代理
      universe/…                  图数据 / 总结评审
  components/
    Canvas.tsx                    画布:流管理、折叠过滤、聚焦、划词接入口
    CardNode.tsx                  卡片:Markdown、术语高亮、引用角标、操作按钮
    PdfPane.tsx                   pdf.js 阅读器 + 划词浮层
    TreeWorkspace.tsx             双栏协调(引用跳页 ↔ 划词提问)
    SummaryModal.tsx              总结评审弹窗
    UniverseView.tsx              3D 力导向宇宙
  lib/
    llm/gateway.ts                LLM Gateway(唯一接触 Anthropic SDK 的模块)
    llm/prompts.ts                系统提示词(冻结)+ 指令模板 + 评审规范
    terms.ts                      [[术语|预览]] / [[page:N]] 协议
    similarity.ts / db.ts / dto.ts
prisma/schema.prisma              Tree/Card/Document/Star/ReviewAttempt(SQLite)
scripts/patch-exfat.mjs           exFAT 兼容补丁(postinstall 自动执行)
```

## LLM 用法速览(实现细节见 04-LLM工程设计.md)

| 场景 | 配置 |
|---|---|
| 卡片生成 | `claude-opus-5` 流式 + effort medium + fallbacks "default";缓存四层:系统提示词(1h)→ 文献 document block(1h, citations)→ 分支上下文(5m)→ 指令 |
| 总结评审 | 非流式 + effort high + `json_schema` 结构化输出 |
| 祖先摘要 | 非流式 + effort low,卡片生成完成后异步预计算 |
| 嵌入 | Voyage `voyage-3`(可选),评审通过时写入,锚点检索 cos≥0.5 取 top3 |

## 测试

```bash
npm run e2e        # 基础浏览器 E2E(空数据路径:建树/画布/错误态/宇宙空状态)
npm run e2e:deep   # 深度 E2E:播种带术语的卡片/恒星/PDF,测全部交互(19 项)
node scripts/clean-seed.mjs   # 清理种子数据
```

两者都需要 dev 服务器已在 localhost:3000 运行。深度 E2E 曾抓出两个真实 bug:
react-markdown 过滤自定义协议导致术语高亮全灭(已修,`urlTransform` 放行 term://
与 cite://)、pdfjs-dist 5.x 与 Next webpack 不兼容导致 PDF 面板崩溃(已修,见下)。

## ⚠️ 版本锁定(不要随意升级)

| 包 | 锁定 | 原因 |
|---|---|---|
| `prisma` / `@prisma/client` | ^6 | v7 对 SQLite 是破坏性改动(driver adapter) |
| `typescript` | ^5 | v7(Go 重写版)Next 尚不支持 |
| `react-pdf` | **^9** | v10 带的 pdfjs-dist 5.x 在 Next webpack 下模块初始化崩溃(`Object.defineProperty called on non-object`) |

## ⚠️ exFAT 磁盘注意事项(本项目在 G: 盘,文件系统为 exFAT)

1. **Turbopack 无法创建 junction** → `dev`/`build` 脚本固定 `--webpack`,不要去掉;
2. **readlink 返回非标准错误码 EISDIR** → `scripts/patch-exfat.mjs` 给 Next 构建追踪打补丁
   (postinstall 自动重打;升级 Next 后若报 `EISDIR ... readlink`,手动跑一次该脚本);
3. 一次性安装大量依赖时 npm 可能静默崩溃,分 2–3 批安装可绕过;
4. 项目移到 NTFS 盘后以上均可撤销。

## 上线前待办(超出 MVP 的工程项)

- 登录与多用户隔离(所有表加 userId;当前为单机单用户);
- 每日生成配额与用量看板(usageJson 已落库,差聚合展示);
- 切换 Postgres + pgvector(schema 见 03 文档);
- 恒星遗忘曲线与复习卡片(v2 特性)。
