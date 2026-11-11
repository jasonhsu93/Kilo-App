import type { ReactNode } from "react";
import { ArrowUpRight, Inbox } from "lucide-react";
import { label } from "@/lib/domain/i18n";
export function Badge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{label(status)}</span>;
}
export function Empty({
  children = "目前沒有資料。完成第一筆操作後，紀錄會顯示在這裡。",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <p>{children}</p>
    </div>
  );
}
export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  if (!rows.length) return <Empty />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} data-label={headers[j]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Metric({
  label: heading,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <section className={`metric ${accent ? "metric-accent" : ""}`}>
      <div className="metric-label">
        {heading}
        <ArrowUpRight size={16} />
      </div>
      <div className="metric-value">{value}</div>
      {detail && <p>{detail}</p>}
    </section>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
