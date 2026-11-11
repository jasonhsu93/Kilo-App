import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isConfigured, supabaseServer } from "@/lib/supabase/server";
import type { Profile } from "@/lib/domain/types";
export const requireStaff = cache(async (): Promise<Profile> => {
  if (!isConfigured()) redirect("/login");
  const client = await supabaseServer();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  const { data, error: profileError } = await client
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .eq("active", true)
    .single();
  if (profileError || !data) redirect("/login?error=staff");
  return data as Profile;
});
export async function requireAdmin() {
  const staff = await requireStaff();
  if (staff.role !== "admin") throw new Error("FORBIDDEN");
  return staff;
}
