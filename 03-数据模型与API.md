# 03 · 数据模型与 API

## 1. 数据库 Schema(PostgreSQL)

### 1.1 核心表

```sql
-- 知识树(一次探索 = 一棵树)
CREATE TABLE trees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,                -- 根问题,自动截取
  document_id   UUID REFERENCES documents(id),-- 关联文献,可空
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 卡片(树节点)
CREATE TABLE cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id       UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES cards(id),    -- NULL = 根卡片
  card_type     TEXT NOT NULL CHECK (card_type IN ('root','child','related','branch')),
  source_term   TEXT,                          -- 由哪个术语点出来的
  title         TEXT NOT NULL,
  content_md    TEXT,                          -- 含 [[term|preview]] 标记的 Markdown
  terms         JSONB NOT NULL DEFAULT '[]',   -- [{term, preview}] 冗余存一份便于检索
  path          TEXT[] NOT NULL,               -- 祖先标题数组,面包屑直接可用
  depth         INT  NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'generating'
                CHECK (status IN ('generating','done','error','refused')),
  ancestor_digest TEXT,                        -- 该节点的"祖先链摘要"(见 04 文档)
  internalized  BOOLEAN NOT NULL DEFAULT false,-- 是否已入思维宇宙
  position      JSONB,                         -- 用户手动拖拽后的画布坐标,可空
  usage         JSONB,                         -- {input_tokens, output_tokens, cache_read...}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cards_tree   ON cards(tree_id);
CREATE INDEX idx_cards_parent ON cards(parent_id);
-- 同树同名去重查询
CREATE INDEX idx_cards_tree_title ON cards(tree_id, lower(title));

-- 文献
CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  filename        TEXT NOT NULL,
  s3_key          TEXT NOT NULL,
  anthropic_file_id TEXT,                      -- Files API 的 file_id,上传一次复用
  page_count      INT,
  status          TEXT NOT NULL DEFAULT 'processing',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 思维宇宙:恒星(通过评审的理解)
CREATE TABLE stars (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  card_id       UUID NOT NULL REFERENCES cards(id),
  concept       TEXT NOT NULL,                 -- 卡片标题
  summary       TEXT NOT NULL,                 -- 用户自己的话
  review        JSONB NOT NULL,                -- AI 评审结果(分数、评语)
  embedding     vector(1024),                  -- voyage-3
  coords_3d     REAL[3],                       -- UMAP 降维结果
  brightness    REAL NOT NULL DEFAULT 1.0,     -- 遗忘曲线用(v2)
  reviewed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stars_user ON stars(user_id);
CREATE INDEX idx_stars_embedding ON stars
  USING hnsw (embedding vector_cosine_ops);

-- 评审记录(含未通过的,用于产品分析与"连续两次未过"逻辑)
CREATE TABLE review_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     UUID NOT NULL REFERENCES cards(id),
  user_id     UUID NOT NULL,
  summary     TEXT NOT NULL,
  result      JSONB NOT NULL,                  -- 结构化评审输出全量
  passed      BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.2 树建模说明

- 采用 **邻接表(parent_id)+ 冗余 path/depth**:读多写少、树深度有限(实际 < 15),递归 CTE 足够;`path` 冗余让面包屑与"整树加载"零递归。
- **祖先链摘要 `ancestor_digest`** 存在卡片上而不是每次现算:生成子卡片时,取父卡片的 `ancestor_digest` + 父卡片自身内容压缩成新摘要(见 04 文档 §3),写入子卡片。这样每张卡片的上下文组装是 O(1) 的。
- **关联卡片(related)** 在树结构上仍挂在父节点下(parent_id 指向被对比的卡片),用 `card_type` 区分渲染样式(横向布局、双向箭头)。

## 2. API 设计

REST + SSE。所有接口挂在 `/api` 下,鉴权中间件注入 `userId`。

### 2.1 卡片

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/trees` | 新建树(根问题或文献引用),body: `{question}` 或 `{documentId, quote, page}`;返回 `{treeId, rootCardId}` |
| GET | `/api/trees/:id` | 整树加载:全部卡片(不含正文可选 `?slim=1`)+ 布局 |
| POST | `/api/cards` | 派生卡片。body: `{parentId, type: 'child'\|'related'\|'branch', sourceTerm?, question?}`。同名卡片已存在时返回 `{redirect: cardId}` |
| GET | `/api/cards/:id/stream` | **SSE**:卡片内容流。事件见下 |
| GET | `/api/cards/:id` | 卡片全文(断线补齐用) |
| PATCH | `/api/cards/:id` | 更新位置/折叠态 |
| DELETE | `/api/cards/:id` | 删除子树 |

**SSE 事件协议**(`/api/cards/:id/stream`):

```
event: delta        data: {"text": "希尔伯特空间是..."}     // 增量文本
event: terms        data: {"terms":[{"term":"内积","preview":"..."}]}  // 流结束后术语确认
event: done         data: {"cardId":"...","usage":{...}}
event: refused      data: {"message":"该内容无法生成"}
event: error        data: {"message":"...","retryable":true}
```

前端在 `delta` 阶段就用正则实时解析 `[[术语|预览]]` 标记渲染高亮,`terms` 事件仅做最终校准。

### 2.2 文献

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/documents` | 上传 PDF(multipart)。服务端:存 S3 → Files API 上传拿 file_id → 返回文档元信息 |
| GET | `/api/documents/:id/file` | 前端 pdf.js 渲染用的原件代理 |

### 2.3 思维宇宙

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/universe/reviews` | 提交总结评审。body: `{cardId, summary}`。返回结构化评审结果(通过则含星体数据) |
| GET | `/api/universe` | 全部恒星:`{stars:[{id, concept, coords, brightness, links[]}]}`,3D 场景一次拉取 |
| GET | `/api/universe/stars/:id` | 恒星详情(回看:总结原文、评语、来源卡片链接) |

## 3. 前端状态要点

- 画布状态(节点/边/视口)由 React Flow 管理,持久化仅在拖拽结束、折叠切换时 PATCH;
- 卡片正文用 React Query 缓存,SSE 进行中的卡片走独立的 streaming store(Zustand),完成后并入 Query 缓存;
- 术语点击 → 乐观插入 "generating" 占位卡片与连线 → 后台 POST,失败则回滚并 toast。
