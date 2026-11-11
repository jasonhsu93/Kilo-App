import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "KILO｜教練工作台", template: "%s · KILO" },
  description: "私人訓練學員、堂數與付款管理",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
