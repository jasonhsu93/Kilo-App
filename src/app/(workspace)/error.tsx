"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="error-page">
      <h1>暫時無法讀取資料</h1>
      <p className="muted">請確認網路連線與 Supabase 設定後重試。</p>
      <Button onClick={reset}>重新載入</Button>
    </div>
  );
}
