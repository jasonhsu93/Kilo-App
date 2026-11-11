"use client";
import { useState, useTransition } from "react";
import { LoaderCircle, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { runCommand } from "@/app/(workspace)/actions";
import type { CommandName } from "@/lib/domain/commands";
import { parseMoney, taipeiToISO, money } from "@/lib/domain/format";
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "number"
    | "money"
    | "datetime-local"
    | "date"
    | "textarea"
    | "select"
    | "checkbox";
  options?: { value: string; label: string; price?: number }[];
  value?: string | number | boolean;
  required?: boolean;
  hint?: string;
  min?: number;
  max?: number;
};
export function CommandForm({
  operation,
  title,
  fields = [],
  initial = {},
  description,
  buttonLabel,
  variant = "default",
  currency = "TWD",
  disabled = false,
}: {
  operation: CommandName;
  title: string;
  fields?: Field[];
  initial?: Record<string, unknown>;
  description?: string;
  buttonLabel?: string;
  disabled?: boolean;
  currency?: string;
  variant?: "default" | "outline" | "ghost" | "destructive";
}) {
  const [open, setOpen] = useState(false),
    [review, setReview] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState(""),
    [duplicate, setDuplicate] = useState(false),
    [pending, start] = useTransition();
  const [key, setKey] = useState("");
  function toggle(value: boolean) {
    if (pending) return;
    setOpen(value);
    if (value) {
      setKey(crypto.randomUUID());
      setReview(
        fields.length
          ? null
          : {
              ...initial,
              ...(operation === "attendance"
                ? { session_at: new Date().toISOString() }
                : {}),
            },
      );
      setError("");
      setDuplicate(false);
    }
  }
  function prepare(form: FormData) {
    try {
      const input = { ...initial };
      for (const f of fields) {
        const value = form.get(f.name)?.toString() || "";
        if (f.type === "checkbox") input[f.name] = form.get(f.name) === "on";
        else if (value === "") {
          delete input[f.name];
        } else if (f.type === "money")
          input[f.name] = parseMoney(value, currency);
        else if (f.type === "number") input[f.name] = Number(value);
        else if (f.type === "datetime-local")
          input[f.name] = taipeiToISO(value);
        else input[f.name] = value;
      }
      setReview(input);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "請檢查欄位");
    }
  }
  function commit() {
    if (!review) return;
    start(async () => {
      try {
        const result = await runCommand(
          operation,
          duplicate ? { ...review, acknowledge_duplicate: true } : review,
          key,
        );
        if (!result.ok) {
          setError(result.message);
          setDuplicate(result.code === "DUPLICATE_DAY_CONFIRMATION");
          return;
        }
        window.dispatchEvent(
          new CustomEvent("kilo:notice", {
            detail: { key, message: "操作已完成，資料已更新。" },
          }),
        );
        setOpen(false);
        setReview(null);
        setError("");
      } catch {
        setError("連線中斷，請重試。相同請求不會重複記帳。");
      }
    });
  }
  return (
    <>
      <Button
        variant={variant}
        disabled={disabled}
        onClick={() => toggle(true)}
      >
        {buttonLabel || title}
      </Button>
      <Dialog
        open={open}
        onOpenChange={toggle}
        title={title}
        description={description}
      >
        <>
          {error && (
            <div role="alert" className="alert alert-error">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
          {!review ? (
            <form action={prepare} className="form-stack">
              {fields.map((f) => (
                <label
                  key={f.name}
                  className={f.type === "checkbox" ? "checkbox-label" : "field"}
                >
                  <span>
                    {f.label}
                    {f.required && (
                      <span className="required" aria-hidden="true">
                        {" "}
                        *
                      </span>
                    )}
                  </span>
                  {f.type === "select" ? (
                    <select
                      name={f.name}
                      onChange={(e) => {
                        if (f.name === "tier_id") {
                          const chosen = f.options?.find(
                            (o) => o.value === e.target.value,
                          );
                          const target =
                            e.target.form?.elements.namedItem("unit_price");
                          if (
                            chosen?.price !== undefined &&
                            target instanceof HTMLInputElement
                          )
                            target.value = String(
                              chosen.price /
                                10 **
                                  (new Intl.NumberFormat("en", {
                                    style: "currency",
                                    currency,
                                  }).resolvedOptions().maximumFractionDigits ??
                                    2),
                            );
                        }
                      }}
                      defaultValue={String(f.value ?? "")}
                      required={f.required}
                    >
                      <option value="">請選擇</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      name={f.name}
                      defaultValue={String(f.value ?? "")}
                      maxLength={2000}
                    />
                  ) : f.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      name={f.name}
                      defaultChecked={f.value === true}
                    />
                  ) : (
                    <input
                      name={f.name}
                      type={f.type === "money" ? "text" : f.type || "text"}
                      inputMode={f.type === "money" ? "decimal" : undefined}
                      defaultValue={String(f.value ?? "")}
                      required={f.required}
                      min={f.min}
                      max={f.max}
                      maxLength={f.type === "text" ? 2000 : undefined}
                      step={f.type === "number" ? 1 : undefined}
                    />
                  )}
                  {f.hint && <small>{f.hint}</small>}
                </label>
              ))}
              <Button type="submit">檢查並確認</Button>
            </form>
          ) : (
            <div className="form-stack">
              <div className="review-box">
                <h3>確認操作內容</h3>
                {fields.map((f) => {
                  const v = review[f.name];
                  return (
                    <div key={f.name}>
                      <span>{f.label}</span>
                      <strong>
                        {f.type === "select"
                          ? f.options?.find((o) => o.value === v)?.label || "—"
                          : f.type === "checkbox"
                            ? v
                              ? "是"
                              : "否"
                            : f.type === "money"
                              ? money(Number(v || 0), currency)
                              : String(v ?? "—")}
                      </strong>
                    </div>
                  );
                })}
                {operation === "purchase" && (
                  <div>
                    <span>方案總額</span>
                    <strong>
                      {money(
                        Number(review.quantity) * Number(review.unit_price),
                        currency,
                      )}
                    </strong>
                  </div>
                )}
                {!fields.length && (
                  <p>
                    {description ||
                      "確認執行此操作？所有變更都會保留稽核紀錄。"}
                  </p>
                )}
              </div>
              <div className="form-actions">
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setReview(null);
                    setError("");
                    setDuplicate(false);
                  }}
                >
                  返回修改
                </Button>
                <Button disabled={pending} onClick={commit}>
                  {pending ? <LoaderCircle className="spin" size={18} /> : null}
                  {pending
                    ? "處理中…"
                    : duplicate
                      ? "確認為另一堂課，繼續扣堂"
                      : "確認送出"}
                </Button>
              </div>
            </div>
          )}
        </>
      </Dialog>
    </>
  );
}
