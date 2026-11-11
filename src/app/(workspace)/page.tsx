import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { loadWorkspace } from "@/lib/server/repository";
import { buildReport } from "@/lib/domain/reports";
import { gymDate, money, dateTime } from "@/lib/domain/format";
import { customerBalance, coachName, isReversed } from "@/lib/domain/selectors";
import { PageHeader, Metric, DataTable, Badge, Empty } from "@/components/data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportChart } from "@/components/report-chart";
export default async function Dashboard() {
  const w = await loadWorkspace();
  if (w.profile.role !== "admin") redirect("/customers");
  const today = gymDate(),
    from = `${today.slice(0, 7)}-01`,
    r = buildReport(w, { from, to: today }),
    daily = buildReport(w, { from: today, to: today });
  const low = w.customers
    .filter((c) => c.active && customerBalance(w, c.id) <= w.threshold)
    .sort((a, b) => customerBalance(w, a.id) - customerBalance(w, b.id));
  const sessions = [...w.sessions]
    .sort((a, b) => b.session_at.localeCompare(a.session_at))
    .slice(0, 5);
  return (
    <>
      <PageHeader
        eyebrow="YOUR GYM, AT A GLANCE"
        title={`${w.profile.name}，今天也一起前進。`}
        description="從每一堂課開始，掌握團隊的日常營運。"
        actions={
          <Button asChild>
            <Link href="/customers">
              <Plus size={16} />
              管理學員
            </Link>
          </Button>
        }
      />
      <div className="metric-grid">
        <Metric
          label="本月登錄收款"
          value={money(r.paymentTotal, w.gym.currency)}
          detail={`今日 ${money(daily.paymentTotal, w.gym.currency)} · 不含已作廢付款`}
          accent
        />
        <Metric
          label="本月完成堂數"
          value={
            <>
              {r.deliveredQuantity}
              <small style={{ fontSize: 13, marginLeft: 6 }}>堂</small>
            </>
          }
          detail={`今日 ${daily.deliveredQuantity} 堂 / ${daily.delivered.length} 次 · 本月 ${r.delivered.length} 次上課`}
        />
        <Metric
          label="活躍學員"
          value={w.customers.filter((c) => c.active).length}
          detail={`${w.coaches.filter((c) => c.active).length} 位啟用中的教練`}
        />
        <Metric
          label="全館剩餘堂數"
          value={r.outstandingQuantity}
          detail={`${low.length} 位學員堂數低於或等於 ${w.threshold}`}
        />
      </div>
      <div className="two-column">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>教練本月授課</CardTitle>
              <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                按實際授課教練統計，含代課
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/reports">
                查看報表 <ArrowRight size={14} />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ReportChart data={r.byCoach} />
            <p className="chart-caption">
              {from} — {today} · 不含已沖銷課程
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>堂數不足提醒</CardTitle>
            <span className="badge">{low.length} 位學員</span>
          </CardHeader>
          <CardContent>
            {low.length ? (
              <div className="low-list">
                {low.slice(0, 5).map((c) => (
                  <Link
                    className="low-row"
                    href={`/customers/${c.id}`}
                    key={c.id}
                  >
                    <div className="staff">
                      <span className="avatar">{c.name.slice(0, 1)}</span>
                      <div>
                        {c.name}
                        <small>
                          {w.assignments
                            .filter((a) => a.customer_id === c.id && a.active)
                            .map((a) => coachName(w, a.coach_id))
                            .join("、") || "尚未指派"}
                        </small>
                      </div>
                    </div>
                    <span className="low-count">
                      剩 {customerBalance(w, c.id)} 堂
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>目前沒有低堂數學員。</Empty>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="metric-grid section-space">
        <Metric
          label="本月待對帳款項"
          value={money(r.pending, w.gym.currency)}
          detail="登錄收款不等同公司已核實入帳"
        />
        <Metric
          label="本月已核實款項"
          value={money(r.verified, w.gym.currency)}
          detail="依付款日期歸屬本月"
        />
        <Metric
          label="本月授課歸屬價值"
          value={money(r.deliveredValue, w.gym.currency)}
          detail={
            r.unknownDelivered
              ? `另 ${r.unknownDelivered} 堂價值未知`
              : "依實際耗用方案單價計算"
          }
        />
        <Metric
          label="未使用方案歸屬價值"
          value={money(r.outstandingValue, w.gym.currency)}
          detail={
            r.unknownOutstanding
              ? `另 ${r.unknownOutstanding} 堂價值未知`
              : "目前餘額快照 · 非正式認列營收"
          }
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>最近上課紀錄</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sessions">
              所有紀錄 <ArrowRight size={14} />
            </Link>
          </Button>
        </CardHeader>
        <DataTable
          headers={["學員", "上課時間", "實際授課教練", "堂數", "狀態"]}
          rows={sessions.map((s) => [
            <Link href={`/customers/${s.customer_id}`} key="name">
              {s.customer_name}
            </Link>,
            dateTime(s.session_at),
            coachName(w, s.teaching_coach_id),
            `${s.quantity} 堂`,
            isReversed(w, s.event_id) ? (
              <Badge key="status" status="reversal" />
            ) : (
              <Badge key="status" status="completed" />
            ),
          ])}
        />
      </Card>
    </>
  );
}
