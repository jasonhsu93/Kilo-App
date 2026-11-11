import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { adminClient, ensureAuthUser } from "./auth-client";
function stable(key: string) {
  const h = createHash("sha256").update(`kilo-demo-v1:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
    host = new URL(url).hostname;
  if (
    process.env.DEV_SEED_ALLOWED !== "true" ||
    (!["localhost", "127.0.0.1"].includes(host) &&
      !["development", "test"].includes(
        process.env.SUPABASE_PROJECT_PURPOSE || "",
      ))
  )
    throw new Error(
      "Seed refused: set DEV_SEED_ALLOWED=true and use local Supabase or explicitly designate SUPABASE_PROJECT_PURPOSE=test/development.",
    );
  const admin = adminClient();
  const { data: existing, error: checkError } = await admin
    .from("audit_logs")
    .select("id")
    .eq("action", "dev_seed_complete")
    .limit(1);
  if (checkError) throw checkError;
  if (existing?.length) {
    console.log(
      "Demo seed already complete; existing data and credentials preserved.",
    );
    return;
  }
  const users: { email: string; password: string; id: string }[] = [];
  // These synthetic accounts are never sent email. Credentials are written to an
  // ignored, owner-readable local file, never committed or printed to logs.
  for (let i = 0; i < 6; i++) {
    const email = i === 0 ? "admin@kilo.example" : `coach${i}@kilo.example`;
    const password =
      process.env.DEV_SEED_PASSWORD || randomBytes(24).toString("base64url");
    if (password.length < 12)
      throw new Error("DEV_SEED_PASSWORD must be at least 12 characters");
    const user = await ensureAuthUser(email, password);
    // Development-only reset ensures interrupted seed retries know their credentials.
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
    });
    if (error) throw error;
    users.push({ email, password, id: user.id });
  }
  const { data: profile } = await admin
    .from("user_profiles")
    .select("*")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  let gym = profile?.gym_id as string | undefined;
  if (!gym) {
    gym = stable("gym");
    const { error } = await admin.rpc("provision_staff", {
      p_user_id: users[0].id,
      p_gym_id: gym,
      p_name: "示範管理員",
      p_role: "admin",
      p_bootstrap: true,
    });
    if (error) throw error;
  } else if (profile?.id !== users[0].id) {
    throw new Error(
      "This database has a non-demo administrator. Seed only a fresh dedicated development/test project.",
    );
  }
  for (let i = 1; i < users.length; i++) {
    const { error } = await admin.rpc("provision_staff", {
      p_user_id: users[i].id,
      p_gym_id: gym,
      p_name: `教練 ${String.fromCharCode(64 + i)}`,
      p_role: "coach",
      p_actor_id: users[0].id,
    });
    if (error) throw error;
  }
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");
  const signed = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: loginError } = await signed.auth.signInWithPassword({
    email: users[0].email,
    password: users[0].password,
  });
  if (loginError) throw loginError;
  async function cmd(op: string, input: Record<string, unknown>, name: string) {
    const { data, error } = await signed.rpc("gym_command", {
      p_operation: op,
      p_input: input,
      p_key: stable(name),
    });
    if (error) throw new Error(`${name}: ${error.message}`);
    return data as { id: string };
  }
  const seedAt = "2026-11-01T01:00:00.000Z";
  // Fixed timestamps keep interrupted retries byte-for-byte idempotent.
  for (let i = 0; i < 50; i++) {
    const co = users[1 + (i % 5)].id,
      customer = await cmd(
        "customer_save",
        {
          name: `示範學員 ${String(i + 1).padStart(2, "0")}`,
          phone: `090000${String(i + 1).padStart(4, "0")}`,
          notes: "合成示範資料，非真實個人資訊。",
        },
        `customer-${i}`,
      );
    await cmd(
      "assignment",
      { customer_id: customer.id, coach_id: co, active: true },
      `assign-${i}`,
    );
    const prices = [200000, 189000, 175000, 168000, 0];
    await cmd(
      "purchase",
      {
        customer_id: customer.id,
        coach_id: co,
        quantity: 10,
        unit_price: prices[i % 5],
        reason: "示範方案",
        method: ["cash", "bank", "card", "other"][i % 4],
        purchased_at: seedAt,
      },
      `purchase-${i}`,
    );
    const used = i % 10;
    if (used)
      await cmd(
        "attendance",
        {
          customer_id: customer.id,
          coach_id: co,
          teaching_coach_id: co,
          quantity: used,
          session_at: "2026-11-02T02:00:00.000Z",
          acknowledge_duplicate: true,
        },
        `attendance-${i}`,
      );
    if (i === 0)
      await cmd(
        "transfer_request",
        {
          customer_id: customer.id,
          coach_id: co,
          destination_coach_id: users[2].id,
          quantity: 3,
          reason: "示範待核准轉移",
        },
        "pending-transfer",
      );
    if (i === 1)
      await cmd(
        "substitution",
        {
          customer_id: customer.id,
          coach_id: co,
          teaching_coach_id: users[1].id,
          quantity: 1,
          session_date: "2026-11-03",
          reason: "示範已核准代課",
        },
        "substitution",
      );
    if (i > 44)
      await cmd(
        "customer_save",
        {
          customer_id: customer.id,
          name: `示範學員 ${String(i + 1).padStart(2, "0")}`,
          active: false,
        },
        `deactivate-${i}`,
      );
  }
  const { data: payments, error } = await admin
    .from("payments")
    .select("id")
    .order("id");
  if (error) throw error;
  for (let i = 0; i < (payments?.length || 0); i++)
    if (i % 3 !== 0)
      await cmd(
        "reconcile",
        {
          payment_id: payments![i].id,
          status: i % 3 === 1 ? "verified" : "disputed",
          reason: "示範對帳",
        },
        `reconcile-${payments![i].id}`,
      );
  await mkdir(".local", { recursive: true });
  await writeFile(
    ".local/demo-accounts.json",
    JSON.stringify(
      users.map(({ email, password }) => ({ email, password })),
      null,
      2,
    ),
    { mode: 0o600 },
  );
  const { error: markError } = await admin
    .from("audit_logs")
    .insert({
      gym_id: gym,
      actor_id: users[0].id,
      action: "dev_seed_complete",
      details: { version: 1 },
    });
  if (markError) throw markError;
  console.log(
    "Seed complete: 1 admin, 5 coaches, 50 synthetic customers. Credentials: .local/demo-accounts.json (owner-readable, ignored by Git).",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
