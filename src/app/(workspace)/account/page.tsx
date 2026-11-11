import Link from "next/link";
import { loadWorkspace } from "@/lib/server/repository";
import { coachName, customerName } from "@/lib/domain/selectors";
import { dateTime } from "@/lib/domain/format";
import { label } from "@/lib/domain/i18n";
import { logout } from "@/app/login/actions";
import { PageHeader, DataTable, Badge } from "@/components/data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export default async function AccountPage() {
  const w = await loadWorkspace(),
    admin = w.profile.role === "admin";
  return (
    <>
      <PageHeader
        eyebrow="YOUR WORKSPACE"
        title="帳戶"
        description={`${w.profile.name} · ${label(w.profile.role)}`}
        actions={
          <form action={logout}>
            <Button variant="outline" type="submit">
              登出帳號
            </Button>
          </form>
        }
      />
      <div className="stack">
        <Card>
          <CardHeader>
            <CardTitle>帳戶與安全</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="muted">
              如需更新密碼，可透過已驗證的登入狀態設定，或使用登入頁的忘記密碼功能。
            </p>
            <div className="inline-actions section-space">
              <Button variant="outline" asChild>
                <Link href="/reset-password">設定新密碼</Link>
              </Button>
              {admin && (
                <>
                  <Button variant="outline" asChild>
                    <Link href="/coaches">員工管理</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/reports">營運報表</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/settings">系統設定</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/imports">CSV 匯入</Link>
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
        {!admin && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>我的轉移申請</CardTitle>
              </CardHeader>
              <DataTable
                headers={["學員", "轉入教練", "堂數", "狀態"]}
                rows={w.transfers.map((t) => [
                  customerName(w, t.customer_id),
                  coachName(w, t.destination_coach_id),
                  t.quantity,
                  <Badge key="status" status={t.status} />,
                ])}
              />
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>我的代課授權</CardTitle>
              </CardHeader>
              <DataTable
                headers={["學員 / 日期", "所屬教練", "使用 / 授權堂數"]}
                rows={w.substitutions
                  .filter((s) => s.teaching_coach_id === w.profile.id)
                  .map((s) => [
                    <Link key="c" href={`/customers/${s.customer_id}`}>
                      {customerName(w, s.customer_id)} · {s.session_date}
                    </Link>,
                    coachName(w, s.owning_coach_id),
                    `${s.consumed} / ${s.quantity}`,
                  ])}
              />
            </Card>
          </>
        )}
        <Card>
          <CardHeader>
            <CardTitle>
              {admin ? "最近稽核紀錄" : "我的操作紀錄"}（最近 100 筆）
            </CardTitle>
          </CardHeader>
          <DataTable
            headers={["時間", "操作人", "操作", "資料編號", "紀錄內容"]}
            rows={w.audits.map((a) => [
              dateTime(a.created_at),
              coachName(w, a.actor_id),
              label(a.action),
              a.record_id?.slice(0, 8) || "—",
              <details key="details">
                <summary>查看稽核資料</summary>
                <pre
                  style={{
                    maxWidth: 300,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    fontSize: 10,
                  }}
                >
                  {JSON.stringify(a.details, null, 2)}
                </pre>
              </details>,
            ])}
          />
        </Card>
      </div>
    </>
  );
}
