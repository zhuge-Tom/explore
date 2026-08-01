import { db } from "@/lib/db";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { toCardUsage } from "@/lib/dto";
import { decodeImageContext } from "@/lib/image-attachments";
import { friendlyLLMError } from "@/lib/limits";
import { streamCard, compressDigest, embed, type VisionImage } from "@/lib/llm/gateway";
import { cosine } from "@/lib/similarity";
import { parseTerms } from "@/lib/terms";
import type { InstructionInput } from "@/lib/llm/prompts";
import { uploadsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 进程内生成锁:防止同一卡片被并发生成(如 React StrictMode 的双连接)
const active = new Map<string, Promise<void>>();

type Send = (event: string, data: unknown) => void;

// GET /api/cards/:id/stream — SSE:生成或回放卡片内容
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send: Send = (event, data) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* 客户端已断开 */
        }
      };

      try {
        const card = await db.card.findUnique({
          where: { id },
          include: { parent: true, tree: { include: { document: true } } },
        });

        if (!card) {
          send("gen_error", { message: "卡片不存在", retryable: false });
        } else if (card.status === "done") {
          // 回放:断线重连 / 二次打开
          send("delta", { text: card.contentMd ?? "" });
          send("terms", { terms: JSON.parse(card.termsJson) });
          send("done", {
            cardId: card.id,
            content: card.contentMd ?? "",
            usage: toCardUsage(card.usageJson),
          });
        } else if (active.has(id)) {
          // 另一个连接正在生成:等它完成后回放
          await active.get(id);
          const fresh = await db.card.findUnique({ where: { id } });
          if (fresh?.status === "done") {
            send("delta", { text: fresh.contentMd ?? "" });
            send("terms", { terms: JSON.parse(fresh.termsJson) });
            send("done", {
              cardId: fresh.id,
              content: fresh.contentMd ?? "",
              usage: toCardUsage(fresh.usageJson),
            });
          } else {
            send("gen_error", { message: "生成失败", retryable: true });
          }
        } else {
          const task = generate(card, send);
          active.set(id, task.catch(() => {}));
          try {
            await task;
          } finally {
            active.delete(id);
          }
        }
      } catch (e) {
        await db.card
          .updateMany({
            where: { id, status: "generating" },
            data: { status: "error" },
          })
          .catch(() => {});
        send("gen_error", { message: friendlyLLMError(e), retryable: true });
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

type CardFull = NonNullable<
  Awaited<
    ReturnType<
      typeof db.card.findUnique<{
        where: { id: string };
        include: { parent: true; tree: { include: { document: true } } };
      }>
    >
  >
>;

/** 知识锚点检索:需要 VOYAGE_API_KEY,否则静默返回空 */
async function findAnchors(
  query: string,
  excludeCardId: string,
): Promise<{ concept: string; summary: string }[]> {
  try {
    const q = await embed([query]);
    if (!q) return [];
    const stars = await db.star.findMany({
      where: { embeddingJson: { not: null }, cardId: { not: excludeCardId } },
      take: 200,
      orderBy: { createdAt: "desc" },
    });
    return stars
      .map((s) => ({
        concept: s.concept,
        summary: s.summary,
        sim: cosine(q[0], JSON.parse(s.embeddingJson!) as number[]),
      }))
      .filter((s) => s.sim >= 0.5)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3)
      .map(({ concept, summary }) => ({ concept, summary }));
  } catch {
    return [];
  }
}

async function loadVisionImages(value: string | null): Promise<{ quote?: string; images: VisionImage[] }> {
  const context = decodeImageContext(value);
  if (!context) return { quote: value ?? undefined, images: [] };
  try {
    const images = await Promise.all(context.images.map(async (image) => ({
      mimeType: image.mimeType,
      data: (await readFile(path.join(uploadsDir(), image.localPath))).toString("base64"),
    })));
    return { quote: context.quote, images };
  } catch {
    throw new Error("图片文件已丢失，请重新上传图片后再提问");
  }
}

/** 把带 citations 的响应内容重组为 Markdown:引用处追加 [[page:N]] 角标 */
function buildContentWithCitations(
  content: { type: string; text?: string; citations?: unknown[] }[],
): string {
  let out = "";
  for (const block of content) {
    if (block.type !== "text" || !block.text) continue;
    out += block.text;
    if (block.citations && block.citations.length > 0) {
      const pages = new Set<number>();
      for (const c of block.citations) {
        const cite = c as { start_page_number?: number };
        if (typeof cite.start_page_number === "number") {
          pages.add(cite.start_page_number);
        }
      }
      for (const p of [...pages].sort((a, b) => a - b)) {
        out += `[[page:${p}]]`;
      }
    }
  }
  return out.trim();
}

async function generate(card: CardFull, send: Send): Promise<void> {
  // 状态为 error/refused 的卡片允许重试,重置为 generating
  if (card.status !== "generating") {
    await db.card.update({
      where: { id: card.id },
      data: { status: "generating", contentMd: null },
    });
  }

  const existingTitles = (
    await db.card.findMany({
      where: { treeId: card.treeId, status: "done" },
      select: { title: true },
      take: 60,
    })
  ).map((c) => c.title);

  const anchors = await findAnchors(
    card.parent ? `${card.parent.title} ${card.title}` : card.title,
    card.id,
  );

  const hasDocument = Boolean(card.tree.document?.textContent);
  const imageContext = await loadVisionImages(card.quoteText);
  const instruction: InstructionInput = {
    cardType: (card.cardType === "root" || !card.parent
      ? "root"
      : card.cardType) as InstructionInput["cardType"],
    subject: card.cardType === "root" ? card.title : (card.sourceTerm ?? card.title),
    parentTitle: card.parent?.title,
    quote: imageContext.quote,
    existingTitles,
    anchors,
    hasDocument,
    hasImages: imageContext.images.length > 0,
  };

  const llmStream = await streamCard({
    instruction,
    branch: card.parent
      ? {
          ancestorDigest: card.parent.ancestorDigest,
          parentTitle: card.parent.title,
          parentContent: card.parent.contentMd ?? "",
        }
      : undefined,
    documentText: card.tree.document?.textContent ?? null,
    images: imageContext.images,
  });

  llmStream.on("text", (delta) => send("delta", { text: delta }));

  const final = await llmStream.finalMessage();

  if (final.stop_reason === "refusal") {
    await db.card.update({
      where: { id: card.id },
      data: { status: "refused" },
    });
    send("refused", { message: "该内容无法生成" });
    return;
  }

  // 文献树:重组内容并插入 [[page:N]] 引用角标(流式阶段没有角标,done 后前端整体替换)
  const contentMd = final.content.trim();
  const terms = parseTerms(contentMd);

  await db.card.update({
    where: { id: card.id },
    data: {
      status: "done",
      contentMd,
      termsJson: JSON.stringify(terms),
      usageJson: JSON.stringify(final.usage),
    },
  });

  send("terms", { terms });
  send("done", {
    cardId: card.id,
    content: contentMd,
    usage: {
      input: final.usage.input_tokens,
      output: final.usage.output_tokens,
      cacheRead: final.usage.cache_read_input_tokens,
      cacheWrite: final.usage.cache_creation_input_tokens,
    },
  });

  // 生成完成后,为"未来的子卡片"预计算本卡的祖先链摘要。
  // done 事件已发出,这一步不影响用户感知延迟;失败则留空(降级)。
  if (card.parent) {
    const digest = await compressDigest(
      card.parent.ancestorDigest,
      card.parent.title,
      card.parent.contentMd ?? "",
    );
    if (digest) {
      await db.card.update({
        where: { id: card.id },
        data: { ancestorDigest: digest },
      });
    }
  }
}
