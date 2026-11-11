"use server";
import { parse } from "csv-parse/sync";
import { requireAdmin } from "@/lib/server/auth";
import { loadWorkspace } from "@/lib/server/repository";
import { importRowSchema, type ImportRow } from "@/lib/domain/commands";
export type Preview = {
  rows: ImportRow[];
  errors: { row: number; message: string }[];
  warnings: string[];
};
export async function previewImport(csv: string): Promise<Preview> {
  await requireAdmin();
  const result: Preview = { rows: [], errors: [], warnings: [] };
  if (Buffer.byteLength(csv, "utf8") > 1000000)
    return { ...result, errors: [{ row: 0, message: "檔案不得超過 1 MB" }] };
  let raw: Record<string, string>[];
  try {
    raw = parse(csv, {
      bom: true,
      columns: (headers: string[]) => {
        if (new Set(headers).size !== headers.length)
          throw new Error("重複欄位名稱");
        return headers;
      },
      skip_empty_lines: true,
      trim: true,
      max_record_size: 20000,
    }) as Record<string, string>[];
  } catch {
    return {
      ...result,
      errors: [
        { row: 0, message: "CSV 格式無效，請使用範本與標準逗號分隔格式。" },
      ],
    };
  }
  if (!raw.length || raw.length > 500)
    return {
      ...result,
      errors: [{ row: 0, message: "每批需有 1–500 筆資料" }],
    };
  const lineNumbers: number[] = [];
  const w = await loadWorkspace(),
    keys = new Set<string>(),
    customerKeys = new Set(
      w.customers.flatMap((c) => (c.external_id ? [c.external_id] : [])),
    ),
    packageKeys = new Set(
      w.packages.flatMap((p) => (p.external_id ? [p.external_id] : [])),
    );
  for (let i = 0; i < raw.length; i++) {
    const input: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw[i]))
      if (v !== "")
        input[k] =
          ["quantity", "remaining", "unit_price", "amount"].includes(k) &&
          /^\d+$/.test(v)
            ? Number(v)
            : v;
    const parsed = importRowSchema.safeParse(input);
    if (!parsed.success) {
      result.errors.push({
        row: i + 2,
        message: parsed.error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("；"),
      });
      continue;
    }
    const row = parsed.data;
    if (
      row.row_type === "payment" &&
      w.payments.some((p) => p.external_id === row.external_id)
    )
      result.errors.push({ row: i + 2, message: "付款外部編號已存在" });
    const key = `${row.row_type}:${row.external_id}`;
    if (keys.has(key))
      result.errors.push({
        row: i + 2,
        message: "同批資料的類型與外部編號重複",
      });
    keys.add(key);
    if (row.row_type === "customer") {
      if (customerKeys.has(row.external_id))
        result.errors.push({
          row: i + 2,
          message: "學員外部編號已存在；請只匯入需要追加的方案，不要重建學員。",
        });
      customerKeys.add(row.external_id);
      if (
        w.customers.some(
          (c) =>
            c.name === row.name ||
            (row.email && c.email === row.email) ||
            (row.phone && c.phone === row.phone),
        ) ||
        result.rows.some(
          (r) => r.row_type === "customer" && r.name === row.name,
        )
      )
        result.warnings.push(
          `第 ${i + 2} 列可能與既有學員重複。系統不會依姓名自動合併，請先確認。`,
        );
    }
    if (row.row_type === "opening" || row.row_type === "package") {
      if (packageKeys.has(row.external_id))
        result.errors.push({ row: i + 2, message: "方案外部編號已存在" });
      packageKeys.add(row.external_id);
    }
    if (
      row.coach_id &&
      !w.coaches.some((c) => c.id === row.coach_id && c.active)
    )
      result.errors.push({
        row: i + 2,
        message: "找不到啟用中的教練，請使用教練 UUID",
      });
    result.rows.push(row);
    lineNumbers.push(i + 2);
  }
  for (let i = 0; i < result.rows.length; i++) {
    const r = result.rows[i];
    if (
      (r.row_type === "opening" || r.row_type === "package") &&
      !customerKeys.has(r.customer_external_id!)
    )
      result.errors.push({
        row: lineNumbers[i],
        message: "找不到對應學員外部編號",
      });
    if (
      r.row_type === "payment" &&
      w.payments.some(
        (pay) =>
          pay.package_id ===
          w.packages.find((p) => p.external_id === r.package_external_id)?.id,
      )
    )
      result.errors.push({
        row: lineNumbers[i],
        message: "此方案已有付款，無法重複匯入",
      });
    if (r.row_type === "payment" && !packageKeys.has(r.package_external_id!))
      result.errors.push({
        row: lineNumbers[i],
        message: "找不到對應方案外部編號",
      });
  }
  return result;
}
