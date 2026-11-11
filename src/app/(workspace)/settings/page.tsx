import { requireAdmin } from "@/lib/server/auth";
import { loadWorkspace } from "@/lib/server/repository";
import { money, currencyScale } from "@/lib/domain/format";
import { PageHeader, DataTable } from "@/components/data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CommandForm } from "@/components/command-form";
export default async function SettingsPage() {
  await requireAdmin();
  const w = await loadWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="BUILT AROUND YOUR GYM"
        title="系統設定"
        description="方案價格異動只適用新購課；歷史方案單價永遠保留。"
      />
      <div className="stack">
        <Card>
          <CardHeader>
            <CardTitle>預設價格方案</CardTitle>
            <CommandForm
              operation="tier_save"
              currency={w.gym.currency}
              title="新增價格方案"
              fields={[
                { name: "name", label: "方案名稱", required: true },
                {
                  name: "unit_price",
                  label: "每堂價格（元）",
                  type: "money",
                  required: true,
                },
              ]}
            />
          </CardHeader>
          <DataTable
            headers={["名稱", "每堂價格", "狀態", "操作"]}
            rows={w.tiers.map((t) => [
              t.name,
              money(t.unit_price, w.gym.currency),
              t.active ? "使用中" : "已停用",
              <CommandForm
                key="edit"
                operation="tier_save"
                currency={w.gym.currency}
                title="編輯方案"
                variant="outline"
                initial={{ tier_id: t.id }}
                fields={[
                  {
                    name: "name",
                    label: "方案名稱",
                    value: t.name,
                    required: true,
                  },
                  {
                    name: "unit_price",
                    label: "每堂價格（元）",
                    type: "money",
                    value: t.unit_price / currencyScale(w.gym.currency),
                    required: true,
                  },
                  {
                    name: "active",
                    label: "啟用方案",
                    type: "checkbox",
                    value: t.active,
                  },
                ]}
              />,
            ])}
          />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>營運偏好</CardTitle>
            <CommandForm
              operation="settings"
              title="調整低堂數提醒"
              variant="outline"
              fields={[
                {
                  name: "low_balance_threshold",
                  label: "剩餘堂數小於或等於此值時提醒",
                  type: "number",
                  value: w.threshold,
                  min: 0,
                  max: 100,
                  required: true,
                },
              ]}
            />
          </CardHeader>
          <CardContent>
            <dl className="info-grid">
              <div>
                <dt>館別</dt>
                <dd>{w.gym.name}</dd>
              </div>
              <div>
                <dt>幣別 / 時區</dt>
                <dd>
                  {w.gym.currency} / {w.gym.timezone}
                </dd>
              </div>
              <div>
                <dt>堂數啟用政策</dt>
                <dd>教練登錄收款後立即可用；公司核實另行處理。</dd>
              </div>
              <div>
                <dt>價格授權</dt>
                <dd>教練可登錄自訂價格與贈課，必須填寫原因。</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
