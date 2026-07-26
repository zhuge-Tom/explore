"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { TreeDTO } from "@/lib/dto";
import { Canvas, type CanvasApi } from "./Canvas";

// react-pdf 依赖浏览器 API,禁 SSR
const PdfPane = dynamic(
  () => import("./PdfPane").then((m) => m.PdfPane),
  { ssr: false, loading: () => <div className="pdf-pane" /> },
);

export function TreeWorkspace({ tree }: { tree: TreeDTO }) {
  const [targetPage, setTargetPage] = useState<{
    page: number;
    ts: number;
  } | null>(null);
  const apiRef = useRef<CanvasApi | null>(null);

  const registerApi = useCallback((api: CanvasApi) => {
    apiRef.current = api;
  }, []);

  const onCiteClick = useCallback((page: number) => {
    setTargetPage({ page, ts: Date.now() });
  }, []);

  const onAsk = useCallback((quote: string) => {
    apiRef.current?.createFromQuote(quote);
  }, []);

  if (!tree.document) {
    return <Canvas initialTree={tree} />;
  }

  return (
    <div className="workspace-split">
      <PdfPane
        documentId={tree.document.id}
        filename={tree.document.filename}
        targetPage={targetPage}
        onAsk={onAsk}
      />
      <div className="workspace-canvas">
        <Canvas
          initialTree={tree}
          onCiteClick={onCiteClick}
          registerApi={registerApi}
        />
      </div>
    </div>
  );
}
