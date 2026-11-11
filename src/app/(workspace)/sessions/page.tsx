import Link from "next/link";
import { loadWorkspace } from "@/lib/server/repository";
import { parseFilters } from "@/lib/server/report-filters";
import { buildReport } from "@/lib/domain/reports";
import { coachName, isReversed } from "@/lib/domain/selectors";
import { dateTime, money } from "@/lib/domain/format";
import { PageHeader, DataTable, Badge } from "@/components/data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportFilters } from "@/components/report-filters";
export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const w = await loadWorkspace(),
    f = parseFilters(await searchParams),
    r = buildReport(w, f),
    admin = w.profile.role === "admin";
  const query = new URLSearchParams({
    ...(Object.fromEntries(
      Object.entries(f).filter(([, v]) => v !== undefined),
    ) as Record<string, string>),
    kind: "sessions",
  });
  return (
    <>
      <PageHeader
        eyebrow="EVERY SESSION COUNTS"
        title="上課紀錄"
        description="按實際上課時間查看紀錄。原始紀錄與沖銷狀態均完整保留。"
        actions={
          admin ? (
            <Button variant="outline" asChild>
              <a href={`/api/export?${query}`}>匯出 CSV</a>
            </Button>
          ) : undefined
        }
      />
      <ReportFilters w={w} filters={f} />
      <Card>
        <DataTable
          headers={[
            "學員 / 日期",
            "授課 / 堂數所屬",
            "堂數 / 當時餘額",
            "方案配置",
            "登錄者",
            "狀態",
          ]}
          rows={r.sessions
            .sort((a, b) => b.session_at.localeCompare(a.session_at))
            .map((s) => [
              <div key="customer">
                <Link href={`/customers/${s.customer_id}`}>
                  {s.customer_name}
                </Link>
                <p className="muted">{dateTime(s.session_at)}</p>
                {s.notes && <p className="muted">{s.notes}</p>}
              </div>,
              <div key="coach">
                {coachName(w, s.teaching_coach_id)}
                <p className="muted">屬於 {coachName(w, s.owning_coach_id)}</p>
              </div>,
              `${s.quantity} 堂 / 剩 ${s.remaining_after} 堂`,
              <div key="parts">
                {w.sessionAllocations
                  .filter((a) => a.session_id === s.id)
                  .map((a) => (
                    <p key={a.allocation_id} className="muted">
                      {a.allocation_id.slice(0, 8)} · {a.quantity} 堂 ×{" "}
                      {money(a.unit_price, w.gym.currency)}
                    </p>
                  ))}
              </div>,
              coachName(w, s.recorded_by),
              <Badge
                key="status"
                status={isReversed(w, s.event_id) ? "reversal" : "completed"}
              />,
            ])}
        />
      </Card>
      <p className="report-note">
        「當時餘額」為登錄當下的教練配置餘額；後續補登或沖銷不會改寫歷史快照。
      </p>
    </>
  );
}
