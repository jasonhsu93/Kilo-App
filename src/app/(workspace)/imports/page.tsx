import { requireAdmin } from "@/lib/server/auth";
import { loadWorkspace } from "@/lib/server/repository";
import { PageHeader, DataTable } from "@/components/data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ImportForm } from "@/components/import-form";
export default async function ImportsPage() {
  await requireAdmin();
  const w = await loadWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="A CLEAN START"
        title="試算表 CSV 匯入"
        description="先驗證預覽，再整批提交。只知道剩餘堂數時，不會捏造過往付款或上課紀錄。"
      />
      <div className="stack">
        <Card>
          <CardHeader>
            <CardTitle>匯入資料</CardTitle>
            <a className="card-link" href="/templates/import.csv" download>
              下載 CSV 範本
            </a>
          </CardHeader>
          <CardContent>
            <p className="muted">
              所有金額使用最小單位（NT$1,750 = 175000），時間須附時區，例如
              2026-11-01T09:00:00+08:00。quantity 為原始堂數，remaining
              為期初剩餘堂數；單價未知請留白。範本的教練 UUID
              需替換成下方實際資料。可參閱 README 的逐欄說明。
            </p>
            <ImportForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>教練對應表</CardTitle>
          </CardHeader>
          <DataTable
            headers={["教練", "coach_id（UUID）", "狀態"]}
            rows={w.coaches.map((c) => [
              c.name,
              c.id,
              c.active ? "啟用中" : "已停用",
            ])}
          />
        </Card>
      </div>
    </>
  );
}
