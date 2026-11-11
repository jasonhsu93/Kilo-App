import type { Workspace } from "./types";
import { gymDate } from "./format";
export interface ReportFilters {
  from: string;
  to: string;
  coach?: string;
  customer?: string;
  status?: string;
}
export function buildReport(w: Workspace, f: ReportFilters) {
  const range = (d: string) => {
    const date = gymDate(d, w.gym.timezone);
    return date >= f.from && date <= f.to;
  };
  const reversed = new Set(
    w.events.flatMap((e) => (e.reverses_event_id ? [e.reverses_event_id] : [])),
  );
  const packages = new Map(w.packages.map((p) => [p.id, p]));
  const payments = w.payments.filter((p) => {
    const k = packages.get(p.package_id);
    return (
      range(p.paid_at) &&
      (!f.coach || k?.original_coach_id === f.coach) &&
      (!f.customer || k?.customer_id === f.customer) &&
      (!f.status || p.status === f.status)
    );
  });
  const sessions = w.sessions.filter(
    (s) =>
      range(s.session_at) &&
      (!f.coach || s.teaching_coach_id === f.coach) &&
      (!f.customer || s.customer_id === f.customer),
  );
  const delivered = sessions.filter((s) => !reversed.has(s.event_id));
  const deliveredIds = new Set(delivered.map((s) => s.id));
  const parts = w.sessionAllocations.filter((a) =>
    deliveredIds.has(a.session_id),
  );
  const outstanding = w.allocations.filter((a) => {
    const p = packages.get(a.package_id);
    return (
      (!f.coach || a.coach_id === f.coach) &&
      (!f.customer || p?.customer_id === f.customer)
    );
  });
  const valid = payments.filter((p) => p.status !== "voided");
  const sum = (status?: string) =>
    valid
      .filter((p) => !status || p.status === status)
      .reduce((s, p) => s + p.amount, 0);
  const methodTotals = Object.fromEntries(
    ["cash", "bank", "card", "other"].map((m) => [
      m,
      valid.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0),
    ]),
  );
  const byCoach = w.coaches.map((c) => ({
    name: c.name,
    quantity: delivered
      .filter((s) => s.teaching_coach_id === c.id)
      .reduce((n, s) => n + s.quantity, 0),
  }));
  const byTier = new Map<
    string,
    { name: string; quantity: number; amount: number }
  >();
  for (const p of valid) {
    const k = packages.get(p.package_id);
    if (!k) continue;
    const name =
      w.tiers.find((t) => t.id === k.tier_id)?.name || "自訂價格 / 歷史付款";
    const row = byTier.get(name) || { name, quantity: 0, amount: 0 };
    row.quantity += k.quantity;
    row.amount += p.amount;
    byTier.set(name, row);
  }
  return {
    payments,
    sessions,
    delivered,
    paymentTotal: sum(),
    verified: sum("verified"),
    pending: sum("pending"),
    disputed: sum("disputed"),
    methodTotals,
    byCoach,
    byTier: [...byTier.values()],
    deliveredQuantity: delivered.reduce((n, s) => n + s.quantity, 0),
    deliveredValue: parts.reduce(
      (n, a) => n + a.quantity * (a.unit_price ?? 0),
      0,
    ),
    unknownDelivered: parts
      .filter((a) => a.unit_price === null)
      .reduce((n, a) => n + a.quantity, 0),
    outstandingQuantity: outstanding.reduce((n, a) => n + a.balance, 0),
    outstandingValue: outstanding.reduce(
      (n, a) => n + a.balance * (packages.get(a.package_id)?.unit_price ?? 0),
      0,
    ),
    unknownOutstanding: outstanding
      .filter((a) => packages.get(a.package_id)?.unit_price === null)
      .reduce((n, a) => n + a.balance, 0),
  };
}
