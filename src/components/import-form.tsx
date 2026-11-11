"use client";
import { useState, useTransition } from "react";
import { previewImport, type Preview } from "@/app/(workspace)/imports/actions";
import { runCommand } from "@/app/(workspace)/actions";
import { Button } from "./ui/button";
import { DataTable } from "./data";
export function ImportForm() {
  const [csv, setCSV] = useState(""),
    [batch, setBatch] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [pending, start] = useTransition(),
    [message, setMessage] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [key, setKey] = useState("");
  function inspect() {
    start(async () => {
      setMessage("");
      setConfirmed(false);
      try {
        setPreview(await previewImport(csv));
        setKey(crypto.randomUUID());
      } catch {
        setMessage("無法預覽，請檢查連線及檔案格式。");
      }
    });
  }
  function commit() {
    if (!preview || preview.errors.length || !confirmed) return;
    start(async () => {
      try {
        const result = await runCommand(
          "import",
          { batch_id: batch, rows: preview.rows },
          key,
        );
        setMessage(
          result.ok ? "匯入完成。原始期初餘額已建立稽核事件。" : result.message,
        );
        if (result.ok) {
          setPreview(null);
          setCSV("");
        }
      } catch {
        setMessage("連線中斷，請使用相同批號與內容重試。");
      }
    });
  }
  return (
    <div className="form-stack">
      <label className="field">
        <span>匯入批號（請保存，重試時使用相同批號）</span>
        <input
          value={batch}
          onChange={(e) => {
            setBatch(e.target.value);
            setPreview(null);
          }}
          placeholder="例如 opening-2026-11-01"
          maxLength={100}
          required
        />
      </label>
      <label className="field">
        <span>選擇 CSV 檔案</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              if (f.size > 1000000) {
                setMessage("檔案不得超過 1 MB");
                return;
              }
              setCSV(await f.text());
              setPreview(null);
            }
          }}
        />
      </label>
      <label className="field">
        <span>或貼上 CSV 內容</span>
        <textarea
          className="import-text"
          value={csv}
          onChange={(e) => {
            setCSV(e.target.value);
            setPreview(null);
          }}
          placeholder="row_type,external_id,name,coach_id…"
        />
      </label>
      <Button disabled={pending || !csv || !batch} onClick={inspect}>
        {pending ? "處理中…" : "驗證與預覽（不會寫入資料）"}
      </Button>
      {message && (
        <div className="alert" role="status">
          {message}
        </div>
      )}
      {preview && (
        <>
          <h3>匯入預覽 · {preview.rows.length} 筆通過格式驗證</h3>
          {preview.errors.map((e, i) => (
            <p className="alert alert-error" key={i}>
              第 {e.row} 列：{e.message}
            </p>
          ))}
          {preview.warnings.map((m, i) => (
            <p className="alert" key={i}>
              {m}
            </p>
          ))}
          <DataTable
            headers={[
              "類型",
              "外部編號",
              "學員 / 對應學員",
              "原始堂數",
              "期初餘額",
              "金額（最小單位）",
            ]}
            rows={preview.rows.map((r) => [
              r.row_type,
              r.external_id,
              r.name || r.customer_external_id || r.package_external_id,
              r.quantity ?? "—",
              r.remaining ?? r.quantity ?? "—",
              r.unit_price ?? r.amount ?? "未知",
            ])}
          />
          {!preview.errors.length && (
            <>
              <label className="checkbox-label">
                <span>
                  已確認姓名重複提醒、教練對應、期初餘額與歷史付款資料。
                </span>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
              </label>
              <Button disabled={pending || !confirmed} onClick={commit}>
                確認原子匯入 {preview.rows.length} 筆
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
