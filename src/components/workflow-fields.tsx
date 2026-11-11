import { CommandForm, type Field } from "./command-form";
import type { Workspace } from "@/lib/domain/types";
import {
  gymDate,
  localDateTime,
  money,
  currencyScale,
} from "@/lib/domain/format";
export const reasonField: Field = {
  name: "reason",
  label: "原因",
  type: "textarea",
  required: true,
};
export const quantityField: Field = {
  name: "quantity",
  label: "堂數",
  type: "number",
  value: 1,
  min: 1,
  max: 100000,
  required: true,
};
export function coachField(
  w: Workspace,
  name = "coach_id",
  title = "堂數所屬教練",
  value?: string,
): Field {
  return {
    name,
    label: title,
    type: "select",
    value,
    required: true,
    options: w.coaches
      .filter((c) => c.active)
      .map((c) => ({ value: c.id, label: c.name })),
  };
}
export function customerField(w: Workspace): Field {
  return {
    name: "customer_id",
    label: "學員",
    type: "select",
    required: true,
    options: w.customers
      .filter((c) => c.active)
      .map((c) => ({ value: c.id, label: c.name })),
  };
}
export function PurchaseButton({
  w,
  customerId,
  coachId,
}: {
  w: Workspace;
  customerId: string;
  coachId: string;
}) {
  const tier = w.tiers.find((t) => t.active);
  const fields: Field[] = [
    { ...quantityField, value: 10 },
    {
      name: "tier_id",
      label: "價格方案（或不選並輸入自訂價格）",
      type: "select",
      value: tier?.id,
      options: w.tiers
        .filter((t) => t.active)
        .map((t) => ({
          value: t.id,
          label: `${t.name} · ${money(t.unit_price, w.gym.currency)}`,
          price: t.unit_price,
        })),
    },
    {
      name: "unit_price",
      label: "每堂價格（元）",
      type: "money",
      value: tier ? tier.unit_price / currencyScale(w.gym.currency) : 1750,
      required: true,
      hint: "輸入 0 為贈課，不建立付款收據。",
    },
    {
      name: "reason",
      label: "自訂價格 / 贈課原因",
      type: "textarea",
      hint: "自訂價格與贈課必填。",
    },
    {
      name: "method",
      label: "付款方式",
      type: "select",
      value: "cash",
      required: true,
      options: [
        { value: "cash", label: "現金" },
        { value: "bank", label: "銀行轉帳" },
        { value: "card", label: "外部刷卡" },
        { value: "other", label: "其他" },
      ],
    },
    {
      name: "purchased_at",
      label: "付款 / 購買時間（台北）",
      type: "datetime-local",
      value: localDateTime(),
      required: true,
    },
  ];
  return (
    <CommandForm
      operation="purchase"
      currency={w.gym.currency}
      title="新增購課方案"
      description="付款登錄後堂數立即可用，款項仍須由管理員核實。總額為堂數 × 每堂價格。"
      initial={{ customer_id: customerId, coach_id: coachId }}
      fields={fields}
      variant="outline"
    />
  );
}
export function AttendanceButton({
  w,
  customerId,
  coachId,
  advanced = false,
}: {
  w: Workspace;
  customerId: string;
  coachId: string;
  advanced?: boolean;
}) {
  return (
    <CommandForm
      operation="attendance"
      title={advanced ? "補登 / 多堂課" : "完成一堂 / 扣除一堂"}
      variant={advanced ? "ghost" : "default"}
      description="將從此教練最早購入的可用方案扣堂，並新增上課紀錄。"
      initial={{
        customer_id: customerId,
        coach_id: coachId,
        teaching_coach_id: coachId,
        quantity: 1,
        session_at: new Date().toISOString(),
      }}
      fields={
        advanced
          ? [
              { ...quantityField, max: 100 },
              {
                name: "session_at",
                label: "上課時間（台北）",
                type: "datetime-local",
                value: localDateTime(),
                required: true,
              },
              { name: "notes", label: "備註", type: "textarea" },
            ]
          : []
      }
    />
  );
}
export function SubstituteButton({
  w,
  customerId,
  substitutionId,
}: {
  w: Workspace;
  customerId: string;
  substitutionId: string;
}) {
  const sub = w.substitutions.find((s) => s.id === substitutionId)!;
  return (
    <CommandForm
      operation="attendance"
      disabled={sub.consumed >= sub.quantity}
      title="記錄已授權代課"
      description={`授權日期 ${sub.session_date}，尚可使用 ${sub.quantity - sub.consumed} 堂。`}
      initial={{
        customer_id: customerId,
        coach_id: sub.owning_coach_id,
        teaching_coach_id: sub.teaching_coach_id,
        substitution_id: sub.id,
      }}
      fields={[
        { ...quantityField, max: sub.quantity - sub.consumed },
        {
          name: "session_at",
          label: "代課時間（台北）",
          type: "datetime-local",
          value:
            sub.session_date === gymDate()
              ? localDateTime()
              : `${sub.session_date}T08:00`,
          required: true,
        },
        { name: "notes", label: "備註", type: "textarea" },
      ]}
    />
  );
}
export function TransferButton({
  w,
  customerId,
  coachId,
}: {
  w: Workspace;
  customerId: string;
  coachId: string;
}) {
  return (
    <CommandForm
      operation="transfer_request"
      title="申請轉移堂數"
      variant="outline"
      initial={{ customer_id: customerId, coach_id: coachId }}
      fields={[
        quantityField,
        {
          ...coachField(w, "destination_coach_id", "轉入教練"),
          options: w.coaches
            .filter((c) => c.active && c.id !== coachId)
            .map((c) => ({ value: c.id, label: c.name })),
        },
        reasonField,
      ]}
      description="僅管理員能核准。轉移保留原始方案價格，不會產生新付款。"
    />
  );
}
export function SubstitutionCreateButton({ w }: { w: Workspace }) {
  return (
    <CommandForm
      operation="substitution"
      title="新增代課授權"
      fields={[
        customerField(w),
        coachField(w),
        coachField(w, "teaching_coach_id", "實際授課教練"),
        {
          name: "session_date",
          label: "授課日期（台北）",
          type: "date",
          value: gymDate(),
          required: true,
        },
        { ...quantityField, max: 100 },
        reasonField,
      ]}
    />
  );
}
