import { requireAdmin } from "@/lib/server/auth";
import { loadWorkspace } from "@/lib/server/repository";
import { label } from "@/lib/domain/i18n";
import { PageHeader, DataTable } from "@/components/data";
import { Card } from "@/components/ui/card";
import { InviteForm } from "@/components/invite-form";
import { CommandForm } from "@/components/command-form";
export default async function CoachesPage() {
  await requireAdmin();
  const w = await loadWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="YOUR TRAINING TEAM"
        title="教練與員工"
        description="由管理員邀請員工，停用帳號會立即阻擋業務操作，歷史資料完整保留。"
        actions={<InviteForm />}
      />
      <Card>
        <DataTable
          headers={["姓名", "角色", "指派學員", "狀態", "操作"]}
          rows={w.profiles.map((p) => [
            p.name,
            label(p.role),
            w.assignments.filter((a) => a.coach_id === p.id && a.active).length,
            p.active ? "啟用中" : "已停用",
            <CommandForm
              key="status"
              operation="staff_status"
              title={p.active ? "停用帳號" : "恢復啟用"}
              variant="outline"
              initial={{ staff_id: p.id, active: !p.active }}
              description="停用不會轉移既有學員或堂數；請另行處理學員指派與剩餘方案。最後一位管理員不可停用。"
            />,
          ])}
        />
      </Card>
    </>
  );
}
