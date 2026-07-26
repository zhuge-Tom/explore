<div align="center">

# Explore 🌲

**Click what you don't understand — watch knowledge grow into a tree**

*A hierarchical knowledge-exploration agent powered by Claude.*

[![CI](https://github.com/zhuge-Tom/explore/actions/workflows/ci.yml/badge.svg)](https://github.com/zhuge-Tom/explore/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![Claude](https://img.shields.io/badge/Claude-opus--5-d97757)](https://platform.claude.com)

[中文](README.md)

</div>

---

## Why?

When you study a hard subject with an AI chatbot, this keeps happening:

> You ask one question ➡️ the answer contains 10 terms you don't know ➡️ you ask about one of them ➡️ that answer contains more new terms… three rounds later, both you and the AI have lost the plot. 😵‍💫

We're exploring the sum of human knowledge through a half-century-old command-line chat box. **Explore replaces the chat stream with a card tree**: every follow-up question grows a new card on an infinite canvas, and the main thread always stays visible.

## ✨ Features

### Hierarchical dialogue — click what you don't understand

Unfamiliar terms are highlighted inside every card. Click one and a child card unfolds next to it, with ancestry context inherited automatically — you never have to re-explain where you were.

![Knowledge tree canvas](docs/screenshots/canvas.png)

- ↗️ **Child cards** — drill into background concepts
- ↔ **Comparison cards** — contrast easily-confused concepts side by side
- ⑂ **Branch cards** — inherit context, ask from a new angle
- Streaming generation, auto-layout, breadcrumbs, dedup-jump, subtree collapse, one-click Markdown export

### Literature mode — ask questions on the paper itself

Import a PDF for a split view: read the original on the left, **select any passage to ask about it**. Answers carry page-number citations that scroll the PDF back to the source.

![PDF split view](docs/screenshots/pdf-mode.png)

### Universe of Mind — make understanding stick

After reading a card, **summarize it in your own words**. Claude reviews for accuracy, coverage, and whether you actually paraphrased. Pass, and your understanding becomes a star in your 3D knowledge universe; fail, and you get specific hints (clues, not answers) to try again.

When generating future cards, the app retrieves your internalized understandings so Claude can **teach new concepts using your own words as anchors**.

![Universe of Mind](docs/screenshots/universe.png)

## 🚀 Quick start

```bash
git clone https://github.com/zhuge-Tom/explore.git
cd explore/explore
npm install          # runs prisma generate automatically
npm run db:push      # zero-config SQLite
npm run dev          # http://localhost:3000
```

Open the homepage and paste your [Anthropic API key](https://platform.claude.com/) into the **⚙️ Settings** panel — it takes effect immediately, with a built-in connection test.

> Optional: a [Voyage AI](https://www.voyageai.com/) key unlocks semantic links and anchor-based teaching in the universe. Without it, everything else still works.

## 🧠 LLM engineering highlights

| Design | Detail |
|---|---|
| **Layered prompt caching** | system prompt (1h) → document (1h) → branch context (5m) → instruction; per-card cache-hit rate shown in the UI |
| **Ancestor digests** | each card pre-compresses its learning path asynchronously — O(1) context assembly at any depth |
| **Content as protocol** | inline `[[term\|preview]]` markers give streaming rendering *and* structured parsing |
| **Structured review** | universe reviews use `json_schema` structured outputs |
| **Cost guards** | daily quota, concurrency cap, usage dashboard (tokens / cache-hit / est. cost) |
| **Robustness** | server-side refusal fallbacks, SSE reconnect-and-catch-up, retries, friendly errors |

## 📄 License

[MIT](LICENSE) © 2026 zhuge-Tom
