import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { loadWorkspace } from "@/lib/server/repository";
import { coachName, customerName, isReversed } from "@/lib/domain/selectors";
import { dateTime } from "@/lib/domain/format";
import { PageHeader, DataTable, Badge } from "@/components/data";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CommandForm } from "@/components/command-form";
import {
  SubstitutionCreateButton,
  customerField,
  coachField,
  reasonField,
  quantityField,
} from "@/components/workflow-fields";
export default async function TransfersPage() {
  await requireAdmin();
  const w = await loadWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="FLEXIBLE, WITH A TRACE"
        title="轉移與代課"
        description="永久轉移與臨時代課分開處理，保留每一堂課的來源。"
        actions={<SubstitutionCreateButton w={w} />}
      />
      <div className="stack">
        <Card>
          <CardHeader>
            <CardTitle>堂數轉移申請</CardTitle>
            <CommandForm
              operation="transfer_request"
              title="新增轉移申請"
              variant="outline"
              fields={[
                customerField(w),
                {
                  ...coachField(w),
                  options: w.coaches.map((c) => ({
                    value: c.id,
                    label: c.name + (c.active ? "" : "（已停用）"),
                  })),
                },
                coachField(w, "destination_coach_id", "轉入教練"),
                quantityField,
                reasonField,
              ]}
            />
          </CardHeader>
          <DataTable
            headers={[
              "學員",
              "轉出 → 轉入",
              "堂數 / 原因",
              "發起者 / 日期",
              "狀態",
              "操作",
            ]}
            rows={w.transfers
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((t) => [
                <Link key="c" href={`/customers/${t.customer_id}`}>
                  {customerName(w, t.customer_id)}
                </Link>,
                `${coachName(w, t.source_coach_id)} → ${coachName(w, t.destination_coach_id)}`,
                <div key="q">
                  {t.quantity} 堂<p className="muted">{t.reason}</p>
                </div>,
                `${coachName(w, t.initiated_by)} · ${dateTime(t.created_at)}`,
                <Badge
                  key="status"
                  status={
                    t.event_id && isReversed(w, t.event_id)
                      ? "reversal"
                      : t.status
                  }
                />,
                t.status === "pending" ? (
                  <div className="inline-actions" key="actions">
                    <CommandForm
                      operation="transfer_decide"
                      title="核准轉移"
                      initial={{ transfer_id: t.id, decision: "approved" }}
                      description={`核准轉移 ${t.quantity} 堂。系統將重新確認餘額，原始方案價格與付款不變。`}
                    />
                    <CommandForm
                      operation="transfer_decide"
                      title="拒絕"
                      variant="outline"
                      initial={{ transfer_id: t.id, decision: "rejected" }}
                    />
                  </div>
                ) : t.event_id && !isReversed(w, t.event_id) ? (
                  <CommandForm
                    key="reverse"
                    operation="reverse"
                    title="沖銷轉移"
                    variant="ghost"
                    initial={{ event_id: t.event_id }}
                    fields={[reasonField]}
                  />
                ) : t.approved_by ? (
                  `審核：${coachName(w, t.approved_by)}`
                ) : (
                  "—"
                ),
              ])}
          />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>已核准代課安排</CardTitle>
          </CardHeader>
          <DataTable
            headers={[
              "學員 / 日期",
              "堂數所屬教練",
              "實際授課教練",
              "使用 / 授權堂數",
              "原因",
            ]}
            rows={w.substitutions.map((s) => [
              <div key="c">
                <Link href={`/customers/${s.customer_id}`}>
                  {customerName(w, s.customer_id)}
                </Link>
                <p className="muted">{s.session_date}</p>
              </div>,
              coachName(w, s.owning_coach_id),
              coachName(w, s.teaching_coach_id),
              `${s.consumed} / ${s.quantity} 堂`,
              s.reason,
            ])}
          />
        </Card>
      </div>
    </>
  );
}
