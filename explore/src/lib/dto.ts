import type { Card, Tree, Document } from "@prisma/client";
import type { Term } from "./terms";

export interface CardUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface CardDTO {
  id: string;
  treeId: string;
  parentId: string | null;
  cardType: string;
  sourceTerm: string | null;
  title: string;
  content: string;
  terms: Term[];
  path: string[];
  depth: number;
  status: string;
  internalized: boolean;
  collapsed: boolean;
  usage: CardUsage | null;
  createdAt: string;
}

/** 原始 Anthropic usage → 客户端摘要 */
export function toCardUsage(usageJson: string | null): CardUsage | null {
  if (!usageJson) return null;
  try {
    const u = JSON.parse(usageJson) as {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    return {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    };
  } catch {
    return null;
  }
}

export interface TreeDTO {
  id: string;
  title: string;
  createdAt: string;
  document: { id: string; filename: string } | null;
  cards: CardDTO[];
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function toCardDTO(c: Card): CardDTO {
  return {
    id: c.id,
    treeId: c.treeId,
    parentId: c.parentId,
    cardType: c.cardType,
    sourceTerm: c.sourceTerm,
    title: c.title,
    content: c.contentMd ?? "",
    terms: safeParse<Term[]>(c.termsJson, []),
    path: safeParse<string[]>(c.pathJson, []),
    depth: c.depth,
    status: c.status,
    internalized: c.internalized,
    collapsed: c.collapsed,
    usage: toCardUsage(c.usageJson),
    createdAt: c.createdAt.toISOString(),
  };
}

export function toTreeDTO(
  t: Tree & { cards: Card[]; document?: Document | null },
): TreeDTO {
  return {
    id: t.id,
    title: t.title,
    createdAt: t.createdAt.toISOString(),
    document: t.document
      ? { id: t.document.id, filename: t.document.filename }
      : null,
    cards: t.cards.map(toCardDTO),
  };
}
