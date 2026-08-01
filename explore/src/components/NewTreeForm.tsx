"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePicker, type ClientImageAttachment } from "./ImagePicker";

export function NewTreeForm() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [images, setImages] = useState<ClientImageAttachment[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const q = question.trim();
    if ((!q && images.length === 0) || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/trees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q || "请分析这张图片",
          images: images.map(({ previewUrl: _previewUrl, ...image }) => image),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { treeId } = (await res.json()) as { treeId: string };
      router.push(`/tree/${treeId}`);
    } catch {
      alert("创建失败,请重试");
      setBusy(false);
    }
  }

  return (
    <div className="new-tree">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="输入一个你想深入理解的问题,比如:什么是量子纠缠?"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <ImagePicker images={images} onChange={setImages} disabled={busy} />
      <button className="primary" onClick={submit} disabled={busy || (!question.trim() && images.length === 0)}>
        {busy ? "创建中…" : "开始探索"}
      </button>
    </div>
  );
}
