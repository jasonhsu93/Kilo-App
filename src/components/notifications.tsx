"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
export function Notifications() {
  const [notice, setNotice] = useState<{ key: string; message: string } | null>(
    null,
  );
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (event: Event) => {
      const value = (event as CustomEvent<{ key: string; message: string }>)
        .detail;
      setNotice(value);
      clearTimeout(timer);
      timer = setTimeout(() => setNotice(null), 6000);
    };
    window.addEventListener("kilo:notice", show);
    return () => {
      window.removeEventListener("kilo:notice", show);
      clearTimeout(timer);
    };
  }, []);
  if (!notice) return null;
  return (
    <div
      className="notice"
      role="status"
      aria-live="polite"
      data-notice-key={notice.key}
    >
      <CheckCircle2 size={20} />
      <span>{notice.message}</span>
      <button aria-label="關閉通知" onClick={() => setNotice(null)}>
        <X size={16} />
      </button>
    </div>
  );
}
