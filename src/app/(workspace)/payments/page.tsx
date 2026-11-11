import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { loadWorkspace } from "@/lib/server/repository";
import { parseFilters } from "@/lib/server/report-filters";
import { buildReport } from "@/lib/domain/reports";
import { coachName, customerName } from "@/lib/domain/selectors";
import { money, dateTime } from "@/lib/domain/format";
import { label } from "@/lib/domain/i18n";
import { PageHeader, Metric, DataTable, Badge } from "@/components/data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CommandForm } from "@/components/command-form";
import { reasonField } from "@/components/workflow-fields";
import { ReportFilters } from "@/components/report-filters";
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const w = await loadWorkspace(),
    f = parseFilters(await searchParams),
    r = buildReport(w, f);
  const query = new URLSearchParams({
    ...(Object.fromEntries(
      Object.entries(f).filter(([, v]) => v !== undefined),
    ) as Record<string, string>),
    kind: "payments",
  });
  return (
    <>
      <PageHeader
        eyebrow="CLEAR COLLECTIONS"
        title="付款與對帳"
        description="教練登錄收款後仍待公司核實。對帳與授課價值分開管理。"
        actions={
          <Button variant="outline" asChild>
            <a href={`/api/export?${query}`}>匯出對帳 CSV</a>
          </Button>
        }
      />
      <ReportFilters w={w} filters={f} status />
      <div className="metric-grid">
        <Metric
          label="登錄收款（不含作廢）"
          value={money(r.paymentTotal, w.gym.currency)}
          accent
        />
        <Metric label="已核實" value={money(r.verified, w.gym.currency)} />
        <Metric label="待公司對帳" value={money(r.pending, w.gym.currency)} />
        <Metric label="有爭議款項" value={money(r.disputed, w.gym.currency)} />
      </div>
      <Card>
        <DataTable
          headers={[
            "學員 / 付款日",
            "金額 / 方式",
            "原始教練 / 登錄者",
            "核實紀錄",
            "狀態",
            "操作",
          ]}
          rows={r.payments
            .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
            .map((p) => {
              const pkg = w.packages.find((k) => k.id === p.package_id)!;
              return [
                <div key="c">
                  <Link href={`/customers/${pkg.customer_id}`}>
                    {customerName(w, pkg.customer_id)}
                  </Link>
                  <p className="muted">{dateTime(p.paid_at)}</p>
                </div>,
                <div key="amount">
                  <strong>{money(p.amount, w.gym.currency)}</strong>
                  <p className="muted">{label(p.method)}</p>
                </div>,
                <div key="coach">
                  {coachName(w, pkg.original_coach_id)}
                  <p className="muted">登錄：{coachName(w, p.recorded_by)}</p>
                </div>,
                p.verified_at
                  ? `${coachName(w, p.verified_by)} · ${dateTime(p.verified_at)}`
                  : "尚未核實",
                <Badge key="status" status={p.status} />,
                p.status === "voided" ? (
                  "已保留沖銷紀錄"
                ) : (
                  <div className="inline-actions" key="actions">
                    <CommandForm
                      operation="reconcile"
                      title="更新對帳狀態"
                      variant="outline"
                      initial={{ payment_id: p.id }}
                      fields={[
                        {
                          name: "status",
                          label: "付款狀態",
                          type: "select",
                          value: p.status,
                          required: true,
                          options: [
                            { value: "pending", label: "待對帳" },
                            { value: "verified", label: "公司已核實" },
                            { value: "disputed", label: "有爭議" },
                          ],
                        },
                        reasonField,
                      ]}
                    />
                    <CommandForm
                      operation="reverse"
                      title="作廢購課與付款"
                      variant="ghost"
                      initial={{ event_id: p.event_id }}
                      fields={[reasonField]}
                      description="將同時沖銷此購課的堂數及付款。已耗用或轉移的堂數需先沖銷後續操作。"
                    />
                  </div>
                ),
              ];
            })}
        />
      </Card>
      <p className="report-note">
        日期篩選使用付款日期。「已核實」表示目前狀態，不代表核實動作發生於所選日期；狀態變更歷史可在帳戶稽核紀錄中查看。
      </p>
    </>
  );
}
