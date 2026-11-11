import { requireAdmin } from "@/lib/server/auth";
import { loadWorkspace } from "@/lib/server/repository";
import { parseFilters } from "@/lib/server/report-filters";
import { buildReport } from "@/lib/domain/reports";
import { money } from "@/lib/domain/format";
import { label } from "@/lib/domain/i18n";
import { PageHeader, Metric, DataTable } from "@/components/data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ReportChart } from "@/components/report-chart";
import { ReportFilters } from "@/components/report-filters";
import { Button } from "@/components/ui/button";
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const w = await loadWorkspace(),
    f = parseFilters(await searchParams),
    r = buildReport(w, f);
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(f).filter(([, v]) => v !== undefined),
    ) as Record<string, string>,
  );
  return (
    <>
      <PageHeader
        eyebrow="INSIGHTS THAT MAKE SENSE"
        title="營運與財務報表"
        description="清楚區分收款、授課歸屬價值與剩餘方案價值；非正式會計認列營收。"
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/export?${query}&kind=summary`}>匯出摘要</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/api/export?${query}&kind=monthly`}>每月授課摘要</a>
            </Button>
          </>
        }
      />
      <ReportFilters w={w} filters={f} status />
      <div className="metric-grid">
        <Metric
          label="期間登錄收款"
          value={money(r.paymentTotal, w.gym.currency)}
          detail="依付款日期 · 排除作廢"
          accent
        />
        <Metric
          label="期間完成堂數"
          value={r.deliveredQuantity}
          detail="依上課日期 · 排除沖銷"
        />
        <Metric
          label="期間授課歸屬價值"
          value={money(r.deliveredValue, w.gym.currency)}
          detail={`另有 ${r.unknownDelivered} 堂價值未知`}
        />
        <Metric
          label="目前未使用方案價值"
          value={money(r.outstandingValue, w.gym.currency)}
          detail={`目前 ${r.outstandingQuantity} 堂，含 ${r.unknownOutstanding} 堂價值未知`}
        />
      </div>
      <div className="two-column">
        <Card>
          <CardHeader>
            <CardTitle>依實際授課教練統計</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportChart data={r.byCoach} />
          </CardContent>
          <DataTable
            headers={["教練", "已完成堂數"]}
            rows={r.byCoach.map((c) => [c.name, c.quantity])}
          />
        </Card>
        <div className="stack">
          <Card>
            <CardHeader>
              <CardTitle>各付款方式收款</CardTitle>
            </CardHeader>
            <DataTable
              headers={["方式", "金額"]}
              rows={Object.entries(r.methodTotals).map(([m, n]) => [
                label(m),
                money(n, w.gym.currency),
              ])}
            />
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>對帳摘要</CardTitle>
            </CardHeader>
            <DataTable
              headers={["目前狀態", "期間付款金額"]}
              rows={[
                [label("pending"), money(r.pending, w.gym.currency)],
                [label("verified"), money(r.verified, w.gym.currency)],
                [label("disputed"), money(r.disputed, w.gym.currency)],
              ]}
            />
          </Card>
        </div>
      </div>
      <Card className="section-space">
        <CardHeader>
          <CardTitle>依價格方案銷售</CardTitle>
        </CardHeader>
        <DataTable
          headers={["方案", "購入堂數", "登錄收款"]}
          rows={r.byTier.map((t) => [
            t.name,
            t.quantity,
            money(t.amount, w.gym.currency),
          ])}
        />
      </Card>
      <p className="report-note">
        銷售以原始方案教練歸屬，授課以實際授課教練歸屬；付款狀態篩選只影響收款統計。剩餘堂數與價值為目前快照，不套用日期範圍。匯入期初餘額不會推算歷史授課。
      </p>
    </>
  );
}
