export const DEFAULT_TIMEZONE = "Asia/Taipei";
export function currencyScale(currency = "TWD"): number {
  return (
    10 **
    (new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2)
  );
}
export function parseMoney(value: string, currency = "TWD"): number {
  const digits = Math.log10(currencyScale(currency));
  const pattern = new RegExp(`^\\d+${digits ? `(\\.\\d{1,${digits}})?` : ""}$`);
  if (!pattern.test(value.trim()))
    throw new Error(`請輸入金額，最多 ${digits} 位小數`);
  const [whole, fraction = ""] = value.trim().split(".");
  const amount =
    Number(whole) * currencyScale(currency) +
    Number(fraction.padEnd(digits, "0"));
  if (!Number.isSafeInteger(amount) || amount > 100000000)
    throw new Error("金額超出範圍");
  return amount;
}
export function money(value: number | null, currency = "TWD"): string {
  if (value === null) return "價值未知";
  const scale = currencyScale(currency),
    digits = Math.log10(scale);
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    minimumFractionDigits: value % scale ? digits : 0,
    maximumFractionDigits: digits,
  }).format(value / scale);
}
export function gymDate(
  value: string | Date = new Date(),
  timezone = DEFAULT_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function localDateTime(value: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(value)
    .replace(" ", "T");
}
export function taipeiToISO(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}
export function dateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: DEFAULT_TIMEZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "\uFEFF";
  const keys = Object.keys(rows[0]);
  return (
    "\uFEFF" +
    [
      keys.map(csvCell).join(","),
      ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(",")),
    ].join("\r\n")
  );
}
