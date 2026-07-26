"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function DocumentForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");

  async function submit() {
    const file = fileRef.current?.files?.[0];
    const q = question.trim() || "总结这篇文献的核心内容和主要贡献";
    if (!file || busy) return;
    setBusy(true);
    try {
      setStage("上传文献中…");
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await fetch("/api/documents", { method: "POST", body: fd });
      const upData = (await upRes.json()) as {
        documentId?: string;
        error?: string;
      };
      if (!upRes.ok || !upData.documentId) {
        alert(upData.error ?? "上传失败");
        return;
      }
      setStage("创建知识树…");
      const res = await fetch("/api/trees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, documentId: upData.documentId }),
      });
      const data = (await res.json()) as { treeId?: string; error?: string };
      if (!res.ok || !data.treeId) {
        alert(data.error ?? "创建失败");
        return;
      }
      router.push(`/tree/${data.treeId}`);
    } catch {
      alert("网络错误,请重试");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  return (
    <div className="doc-form">
      <div className="doc-form-row">
        <button
          className="file-pick"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {fileName ? `📄 ${fileName}` : "📄 选择 PDF 文献"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <input
          className="doc-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="想先弄懂什么?(留空则先总结全文)"
        />
        <button className="primary" onClick={submit} disabled={busy || !fileName}>
          {busy ? stage || "处理中…" : "导入并探索"}
        </button>
      </div>
      <p className="doc-form-hint">
        导入后进入双栏模式:左侧读原文,选中不懂的内容直接提问;卡片回答自带页码引用。
      </p>
    </div>
  );
}
