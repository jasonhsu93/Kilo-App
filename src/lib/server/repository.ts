import "server-only";
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { requireStaff } from "./auth";
import type { Workspace } from "@/lib/domain/types";
export const loadWorkspace = cache(async (): Promise<Workspace> => {
  const profile = await requireStaff(),
    client = await supabaseServer();
  async function rows(table: string): Promise<unknown[]> {
    const result: unknown[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .range(offset, offset + 999)
        .order(
          table === "customer_coach_assignments"
            ? "customer_id"
            : table === "session_allocations"
              ? "session_id"
              : "id",
        );
      if (error) throw new Error(`資料讀取失敗 (${table})`);
      result.push(...data);
      if (data.length < 1000) return result;
    }
  }
  const tables = [
    "customers",
    "coaches",
    "user_profiles",
    "customer_coach_assignments",
    "packages",
    "package_allocations",
    "payments",
    "sessions",
    "session_allocations",
    "credit_events",
    "credit_ledger_entries",
    "transfer_requests",
    "substitution_authorizations",
    "price_tiers",
    "substitution_context",
  ];
  const [loaded, gymResult, settingsResult, auditResult] = await Promise.all([
    Promise.all(tables.map(rows)),
    client.from("gyms").select("*").eq("id", profile.gym_id).single(),
    client
      .from("gym_settings")
      .select("*")
      .eq("gym_id", profile.gym_id)
      .single(),
    client
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (gymResult.error || settingsResult.error || auditResult.error)
    throw new Error("資料讀取失敗");
  const [
    customers,
    coaches,
    profiles,
    assignments,
    packages,
    allocations,
    payments,
    sessions,
    sessionAllocations,
    events,
    ledger,
    transfers,
    substitutions,
    tiers,
    substitutionContexts,
  ] = loaded;
  const mergedCustomers = [...customers];
  for (const value of substitutionContexts as Workspace["substitutionContexts"])
    if (
      !mergedCustomers.some(
        (c) => (c as { id: string }).id === value.customer_id,
      )
    )
      mergedCustomers.push({
        id: value.customer_id,
        name: value.customer_name,
        active: value.active,
        phone: null,
        email: null,
        notes: null,
        external_id: null,
        created_at: "",
      });
  return {
    profile,
    gym: gymResult.data,
    customers: mergedCustomers,
    coaches,
    profiles,
    assignments,
    packages,
    allocations,
    payments,
    sessions,
    sessionAllocations,
    events,
    ledger,
    transfers,
    substitutions,
    tiers,
    audits: auditResult.data,
    threshold: settingsResult.data.low_balance_threshold,
    substitutionContexts,
  } as Workspace;
});
