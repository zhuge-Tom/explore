import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Explore — 哪里不懂点哪里",
  description: "AI 结构化思维与知识探索工具",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
