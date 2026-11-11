import { z } from "zod";
const uuid = z.uuid();
const text = z.string().trim().min(1).max(100);
const reason = z.string().trim().min(1, "請填寫原因").max(2000);
const notes = z.string().max(2000).optional();
const quantity = z.number().int().min(1).max(100000);
const price = z.number().int().min(0).max(100000000);
const datetime = z.iso.datetime({ offset: true });
const date = z.iso.date();
const customer = { customer_id: uuid };
const allocation = { ...customer, coach_id: uuid, quantity };
const email = z.union([z.email().max(254), z.literal("")]).optional();
export const importRowSchema = z
  .strictObject({
    row_type: z.enum(["customer", "opening", "package", "payment"]),
    external_id: text,
    customer_external_id: text.optional(),
    name: text.optional(),
    phone: z.string().max(50).optional(),
    email,
    notes,
    coach_id: uuid.optional(),
    quantity: quantity.optional(),
    remaining: z.number().int().min(0).max(100000).optional(),
    unit_price: price.optional(),
    purchased_at: datetime.optional(),
    package_external_id: text.optional(),
    amount: z.number().int().positive().max(10000000000000).optional(),
    method: z.enum(["cash", "bank", "card", "other"]).optional(),
    paid_at: datetime.optional(),
  })
  .superRefine((r, ctx) => {
    const require = (ok: boolean, field: string) => {
      if (!ok)
        ctx.addIssue({ code: "custom", path: [field], message: "必填欄位" });
    };
    if (r.row_type === "customer") require(!!r.name, "name");
    if (r.row_type === "opening" || r.row_type === "package") {
      require(!!r.customer_external_id, "customer_external_id");
      require(!!r.coach_id, "coach_id");
      require(!!r.quantity, "quantity");
      if (r.remaining !== undefined && r.quantity && r.remaining > r.quantity)
        ctx.addIssue({
          code: "custom",
          path: ["remaining"],
          message: "剩餘堂數不得大於原始堂數",
        });
    }
    if (r.row_type === "payment") {
      require(!!r.package_external_id, "package_external_id");
      require(!!r.amount, "amount");
      require(!!r.method, "method");
      require(!!r.paid_at, "paid_at");
    }
  });
export type ImportRow = z.infer<typeof importRowSchema>;
export const commandSchemas = {
  purchase: z.strictObject({
    ...allocation,
    unit_price: price,
    tier_id: uuid.optional(),
    reason: reason.optional(),
    method: z.enum(["cash", "bank", "card", "other"]),
    purchased_at: datetime,
  }),
  attendance: z.strictObject({
    ...allocation,
    quantity: quantity.max(100),
    teaching_coach_id: uuid,
    session_at: datetime,
    substitution_id: uuid.optional(),
    notes,
    acknowledge_duplicate: z.boolean().default(false),
  }),
  transfer_request: z.strictObject({
    ...allocation,
    destination_coach_id: uuid,
    reason,
  }),
  transfer_decide: z.strictObject({
    transfer_id: uuid,
    decision: z.enum(["approved", "rejected"]),
  }),
  substitution: z.strictObject({
    ...allocation,
    quantity: quantity.max(100),
    teaching_coach_id: uuid,
    session_date: date,
    reason,
  }),
  reconcile: z.strictObject({
    payment_id: uuid,
    status: z.enum(["pending", "verified", "disputed"]),
    reason,
  }),
  reverse: z.strictObject({ event_id: uuid, reason }),
  adjust: z.strictObject({
    ...allocation,
    direction: z.enum(["add", "remove"]),
    reason,
  }),
  customer_save: z.strictObject({
    customer_id: uuid.optional(),
    name: text,
    phone: z.string().max(50).optional(),
    email,
    notes,
    active: z.boolean().default(true),
  }),
  assignment: z.strictObject({
    ...customer,
    coach_id: uuid,
    active: z.boolean().default(true),
  }),
  staff_status: z.strictObject({ staff_id: uuid, active: z.boolean() }),
  settings: z.strictObject({
    low_balance_threshold: z.number().int().min(0).max(100),
  }),
  tier_save: z.strictObject({
    tier_id: uuid.optional(),
    name: text.max(80),
    unit_price: price.min(1),
    active: z.boolean().default(true),
  }),
  import: z.strictObject({
    batch_id: text,
    rows: z.array(importRowSchema).min(1).max(500),
  }),
};
export type CommandName = keyof typeof commandSchemas;
export type CommandInput<T extends CommandName> = z.input<
  (typeof commandSchemas)[T]
>;
export type CommandResult = {
  id: string;
  event_id?: string | null;
  customer_id?: string | null;
  balance?: number;
  already_imported?: boolean;
};
export type ActionResult =
  | { ok: true; data: CommandResult }
  | { ok: false; code: string; message: string };
export const adminCommands = new Set<CommandName>([
  "transfer_decide",
  "substitution",
  "reconcile",
  "reverse",
  "adjust",
  "customer_save",
  "assignment",
  "staff_status",
  "settings",
  "tier_save",
  "import",
]);
