"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function PdfPane({
  documentId,
  filename,
  targetPage,
  onAsk,
}: {
  documentId: string;
  filename: string;
  /** 卡片引用角标点击后要滚动到的页码(用时间戳对象触发重复跳转) */
  targetPage: { page: number; ts: number } | null;
  onAsk: (quote: string) => void;
}) {
  const [numPages, setNumPages] = useState(0);
  const [selection, setSelection] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());

  // 引用角标 → 滚动到对应页
  useEffect(() => {
    if (!targetPage) return;
    const el = pageRefs.current.get(targetPage.page);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [targetPage]);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!sel || !text || text.length < 4 || text.length > 1500) {
      setSelection(null);
      return;
    }
    // 仅处理发生在本面板内的选区
    const container = containerRef.current;
    if (!container || !container.contains(sel.anchorNode)) {
      setSelection(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    setSelection({
      text,
      x: rect.left - cRect.left + rect.width / 2,
      y: rect.top - cRect.top + container.scrollTop,
    });
  }, []);

  return (
    <div className="pdf-pane" ref={containerRef} onMouseUp={handleMouseUp}>
      <div className="pdf-title">📄 {filename}</div>
      <Document
        file={`/api/documents/${documentId}/file`}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<p className="pdf-loading">文献加载中…</p>}
        error={<p className="pdf-loading">文献加载失败</p>}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <div
            key={i + 1}
            ref={(el) => {
              if (el) pageRefs.current.set(i + 1, el);
            }}
            className="pdf-page-wrap"
          >
            <Page
              pageNumber={i + 1}
              width={520}
              renderAnnotationLayer={false}
            />
            <div className="pdf-page-num">p.{i + 1}</div>
          </div>
        ))}
      </Document>

      {selection && (
        <button
          className="ask-float"
          style={{ left: selection.x, top: selection.y - 40 }}
          onMouseDown={(e) => {
            e.preventDefault();
            onAsk(selection.text);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          🔍 就选中内容提问
        </button>
      )}
    </div>
  );
}
