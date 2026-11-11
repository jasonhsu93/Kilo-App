import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWorkspace } from "@/lib/server/repository";
import { customerBalance, coachName, isReversed } from "@/lib/domain/selectors";
import { money, dateTime } from "@/lib/domain/format";
import { label } from "@/lib/domain/i18n";
import { PageHeader, DataTable, Badge } from "@/components/data";
import { CommandForm } from "@/components/command-form";
import {
  AttendanceButton,
  PurchaseButton,
  TransferButton,
  SubstituteButton,
  coachField,
  reasonField,
  quantityField,
} from "@/components/workflow-fields";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    w = await loadWorkspace(),
    fullCustomer = w.customers.find((c) => c.id === id),
    history = w.sessions.find((s) => s.customer_id === id);
  const historical = !fullCustomer;
  const c =
    fullCustomer ||
    (history
      ? {
          id,
          name: history.customer_name,
          active: false,
          phone: null,
          email: null,
          notes: null,
          external_id: null,
          created_at: "",
        }
      : undefined);
  if (!c) notFound();
  const admin = w.profile.role === "admin";
  const assignments = w.assignments.filter(
    (a) =>
      a.customer_id === id &&
      a.active &&
      (admin || a.coach_id === w.profile.id),
  );
  if (admin)
    for (const owner of w.coaches)
      if (
        customerBalance(w, id, owner.id) > 0 &&
        !assignments.some((a) => a.coach_id === owner.id)
      )
        assignments.push({
          customer_id: id,
          coach_id: owner.id,
          active: false,
        });
  const sessions = w.sessions
    .filter((s) => s.customer_id === id)
    .sort((a, b) => b.session_at.localeCompare(a.session_at));
  const packages = w.packages
    .filter((p) => p.customer_id === id)
    .sort((a, b) => b.purchased_at.localeCompare(a.purchased_at));
  return (
    <>
      <p className="muted" style={{ marginBottom: 18 }}>
        <Link href="/customers">學員管理</Link> / 學員資料
      </p>
      <PageHeader
        title={c.name}
        description={
          historical
            ? "僅顯示您的歷史授課紀錄；完整學員資料僅供目前指派教練查看。"
            : c.active
              ? "學員檔案與堂數紀錄"
              : "已停用 · 歷史紀錄完整保留"
        }
        actions={
          admin ? (
            <CommandForm
              operation="customer_save"
              title="編輯學員"
              variant="outline"
              initial={{ customer_id: id }}
              fields={[
                { name: "name", label: "姓名", value: c.name, required: true },
                { name: "phone", label: "電話", value: c.phone || "" },
                {
                  name: "email",
                  label: "電子郵件",
                  type: "email",
                  value: c.email || "",
                },
                {
                  name: "notes",
                  label: "備註",
                  type: "textarea",
                  value: c.notes || "",
                },
                {
                  name: "active",
                  label: "啟用學員",
                  type: "checkbox",
                  value: c.active,
                },
              ]}
            />
          ) : undefined
        }
      />
      <div className="stack">
        <Card>
          <CardHeader>
            <CardTitle>教練專屬堂數</CardTitle>
            {admin && (
              <CommandForm
                operation="assignment"
                title="管理教練指派"
                variant="outline"
                initial={{ customer_id: id }}
                fields={[
                  coachField(w),
                  {
                    name: "active",
                    label: "啟用指派",
                    type: "checkbox",
                    value: true,
                  },
                ]}
                description="停用指派不會轉移或清除堂數。請先處理剩餘方案，再調整教練安排。"
              />
            )}
          </CardHeader>
          <CardContent>
            {assignments.length ? (
              <div className="stack">
                {assignments.map((a) => (
                  <div className="allocation" key={a.coach_id}>
                    <div className="profile-summary">
                      <div style={{ flex: 1 }}>
                        <p className="muted">
                          {coachName(w, a.coach_id)}
                          {!a.active ? " · 指派已停用" : ""}
                          {!w.coaches.find((co) => co.id === a.coach_id)?.active
                            ? " · 教練已停用"
                            : ""}
                        </p>
                        <strong>
                          {customerBalance(w, id, a.coach_id)}{" "}
                          <small style={{ fontSize: 13 }}>堂</small>
                        </strong>
                      </div>
                    </div>
                    {c.active &&
                      a.active &&
                      w.coaches.find((co) => co.id === a.coach_id)?.active && (
                        <div
                          className="inline-actions"
                          style={{ marginTop: 14 }}
                        >
                          <AttendanceButton
                            w={w}
                            customerId={id}
                            coachId={a.coach_id}
                          />
                          <PurchaseButton
                            w={w}
                            customerId={id}
                            coachId={a.coach_id}
                          />
                          <TransferButton
                            w={w}
                            customerId={id}
                            coachId={a.coach_id}
                          />
                          <AttendanceButton
                            w={w}
                            customerId={id}
                            coachId={a.coach_id}
                            advanced
                          />
                        </div>
                      )}
                    {admin &&
                      c.active &&
                      (!a.active ||
                        !w.coaches.find((co) => co.id === a.coach_id)
                          ?.active) &&
                      customerBalance(w, id, a.coach_id) > 0 && (
                        <div className="section-space">
                          <TransferButton
                            w={w}
                            customerId={id}
                            coachId={a.coach_id}
                          />
                        </div>
                      )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">尚無可操作的教練指派。請聯絡管理員。</p>
            )}
            {w.substitutions
              .filter(
                (s) =>
                  s.customer_id === id &&
                  (admin || s.teaching_coach_id === w.profile.id),
              )
              .map((s) => (
                <div className="allocation section-space" key={s.id}>
                  <h3>
                    {s.consumed >= s.quantity ? "已完成代課" : "已核准代課"} ·{" "}
                    {s.session_date}
                  </h3>
                  <p className="muted">
                    {coachName(w, s.teaching_coach_id)} 代{" "}
                    {coachName(w, s.owning_coach_id)} 授課 · 可用{" "}
                    {s.quantity - s.consumed} 堂 · 所屬方案目前剩{" "}
                    {w.substitutionContexts.find((x) => x.id === s.id)
                      ?.owning_balance ??
                      customerBalance(w, id, s.owning_coach_id)}{" "}
                    堂
                  </p>
                  <div className="section-space">
                    <SubstituteButton
                      w={w}
                      customerId={id}
                      substitutionId={s.id}
                    />
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>基本資料</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="info-grid">
              <div>
                <dt>電話</dt>
                <dd>{c.phone || "未提供"}</dd>
              </div>
              <div>
                <dt>電子郵件</dt>
                <dd>{c.email || "未提供"}</dd>
              </div>
              <div>
                <dt>備註</dt>
                <dd>{c.notes || "無"}</dd>
              </div>
              <div>
                <dt>學員編號</dt>
                <dd>{c.id}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>上課紀錄</CardTitle>
          </CardHeader>
          <DataTable
            headers={[
              "日期",
              "實際授課 / 堂數所屬",
              "使用堂數 / 當時餘額",
              "登錄者",
              "狀態",
            ]}
            rows={sessions.map((s) => [
              dateTime(s.session_at),
              <div key="coach">
                {coachName(w, s.teaching_coach_id)}
                <p className="muted">
                  堂數屬於 {coachName(w, s.owning_coach_id)}
                </p>
              </div>,
              `${s.quantity} 堂 / 剩 ${s.remaining_after} 堂`,
              coachName(w, s.recorded_by),
              <Badge
                key="status"
                status={isReversed(w, s.event_id) ? "reversal" : "completed"}
              />,
            ])}
          />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>方案與付款紀錄</CardTitle>
          </CardHeader>
          <DataTable
            headers={[
              "購買日期",
              "原始教練",
              "原始堂數 / 單價",
              "款項狀態",
              "方案類型",
            ]}
            rows={packages.map((p) => {
              const payment = w.payments.find((x) => x.package_id === p.id);
              return [
                dateTime(p.purchased_at),
                coachName(w, p.original_coach_id),
                `${p.quantity} 堂 × ${money(p.unit_price, w.gym.currency)}`,
                payment ? (
                  <Badge key="status" status={payment.status} />
                ) : p.kind === "complimentary" ? (
                  "贈課，無收款"
                ) : p.kind === "paid" ? (
                  "付款資料限原始教練／管理員查看"
                ) : (
                  "無付款資料"
                ),
                label(p.kind),
              ];
            })}
          />
        </Card>
        {admin && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>管理員堂數調整</CardTitle>
                <CommandForm
                  operation="adjust"
                  title="新增稽核調整"
                  variant="outline"
                  initial={{ customer_id: id }}
                  fields={[
                    coachField(w),
                    quantityField,
                    {
                      name: "direction",
                      label: "調整方式",
                      type: "select",
                      value: "add",
                      required: true,
                      options: [
                        { value: "add", label: "增加堂數（價值未知）" },
                        {
                          value: "remove",
                          label: "減少堂數（依方案先進先出）",
                        },
                      ],
                    },
                    reasonField,
                  ]}
                />
              </CardHeader>
              <CardContent>
                <p className="muted">
                  訂正既有交易請使用沖銷；僅在需要獨立調整時新增調整事件。
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>堂數事件與沖銷</CardTitle>
              </CardHeader>
              <DataTable
                headers={["日期", "事件", "原因", "操作"]}
                rows={w.events
                  .filter((e) => e.customer_id === id)
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((e) => [
                    dateTime(e.created_at),
                    label(e.kind),
                    e.reason || "—",
                    e.kind === "reversal" || isReversed(w, e.id) ? (
                      "已保留沖銷紀錄"
                    ) : (
                      <CommandForm
                        key="reverse"
                        operation="reverse"
                        title="沖銷交易"
                        variant="ghost"
                        initial={{ event_id: e.id }}
                        fields={[reasonField]}
                        description="以補償分錄恢復原始配置，保留所有歷史。購課沖銷亦會作廢付款；若堂數已耗用，須先沖銷後續相關操作。"
                      />
                    ),
                  ])}
              />
            </Card>
          </>
        )}
      </div>
    </>
  );
}
