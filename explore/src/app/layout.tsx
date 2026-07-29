import type { Metadata } from "next";
import "./globals.css";
import { SettingsPanel } from "@/components/SettingsPanel";

export const metadata: Metadata = {
  title: "Explore",
  description: "AI 结构化思维与知识探索工具",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}<SettingsPanel /></body>
    </html>
  );
}
