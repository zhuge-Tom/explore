"use client";

import { useState } from "react";
import type { ReviewResult } from "@/lib/llm/prompts";
import { MIN_REVIEW_SUMMARY_LENGTH } from "@/lib/review";

type ReviewResponse = ReviewResult & { starId: string | null; attempts: number };

export function SummaryModal({
  cardId,
  cardTitle,
  onClose,
  onPassed,
}: {
  cardId: string;
  cardTitle: string;
  onClose: () => void;
  onPassed: (cardId: string) => void;
}) {
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summaryLength = summary.trim().length;

  async function submit() {
    if (busy || summaryLength < MIN_REVIEW_SUMMARY_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/universe/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, summary: summary.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "评审失败,请重试");
        return;
      }
      const review = data as ReviewResponse;
      setResult(review);
      if (review.passed) onPassed(cardId);
    } catch {
      setError("网络错误,请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>✍️ 用自己的话总结《{cardTitle}》</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {!result && (
          <>
            <p className="modal-hint">
              不要复述卡片原文 —— 用你自己的话说清楚它是什么。通过 AI
              评审后,这条理解会成为你思维宇宙中的一颗恒星 ✨(建议 50–300 字)
            </p>
            <textarea
              className="modal-textarea"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="我理解的是……"
              autoFocus
            />
            <div className={`review-character-count ${summaryLength < MIN_REVIEW_SUMMARY_LENGTH ? "short" : "ready"}`}>
              <span>已输入 {summaryLength} 个字</span>
              <span>
                {summaryLength < MIN_REVIEW_SUMMARY_LENGTH
                  ? `至少再写 ${MIN_REVIEW_SUMMARY_LENGTH - summaryLength} 个字即可提交`
                  : "可以提交评审"}
              </span>
            </div>
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-actions">
              <button
                className="primary"
                onClick={submit}
                disabled={busy || summaryLength < MIN_REVIEW_SUMMARY_LENGTH}
              >
                {busy ? "评审中…" : "提交评审"}
              </button>
            </div>
          </>
        )}

        {result && result.passed && (
          <div className="review-result passed">
            <p className="review-verdict">🌟 通过!这条理解已进入你的思维宇宙</p>
            <p className="review-praise">{result.praise}</p>
            {result.gaps.length > 0 && (
              <div className="review-gaps">
                <p>还可以更进一步:</p>
                <ul>
                  {result.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="modal-actions">
              <a href="/universe">去看看思维宇宙 →</a>
              <button className="primary" onClick={onClose}>
                继续探索
              </button>
            </div>
          </div>
        )}

        {result && !result.passed && (
          <div className="review-result failed">
            <p className="review-verdict">还差一点,再试一次 💪</p>
            {result.praise && <p className="review-praise">{result.praise}</p>}
            {result.gaps.length > 0 && (
              <div className="review-gaps">
                <ul>
                  {result.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="review-hint">💡 {result.hint}</p>
            <div className="modal-actions">
              <button
                className="primary"
                onClick={() => {
                  setResult(null);
                }}
              >
                修改我的总结
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
