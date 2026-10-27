import type { Metadata } from "next";
import "./globals.css";
import "./learning.css";
export const metadata: Metadata = {
  title: "Inkword · 从阅读到记住",
  description: "将 PDF 高亮整理为属于你的英语生词本。",
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
