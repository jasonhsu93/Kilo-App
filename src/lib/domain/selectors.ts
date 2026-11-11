import type { Workspace } from "./types";
export function coachName(w: Workspace, id: string | null) {
  return (
    w.coaches.find((c) => c.id === id)?.name ||
    w.profiles.find((p) => p.id === id)?.name ||
    "管理員"
  );
}
export function customerName(w: Workspace, id: string) {
  return (
    w.customers.find((c) => c.id === id)?.name ||
    w.sessions.find((s) => s.customer_id === id)?.customer_name ||
    "歷史學員"
  );
}
export function customerBalance(w: Workspace, id: string, coach?: string) {
  const ids = new Set(
    w.packages.filter((p) => p.customer_id === id).map((p) => p.id),
  );
  return w.allocations
    .filter((a) => ids.has(a.package_id) && (!coach || a.coach_id === coach))
    .reduce((s, a) => s + a.balance, 0);
}
export function isReversed(w: Workspace, id: string) {
  return w.events.some((e) => e.reverses_event_id === id);
}
