import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminClient, ensureAuthUser } from "./auth-client";
async function main() {
  const email = z.email().parse(process.env.BOOTSTRAP_EMAIL),
    password = z
      .string()
      .min(12)
      .max(128)
      .parse(process.env.BOOTSTRAP_PASSWORD);
  const client = adminClient();
  const { data: admins, error } = await client
    .from("user_profiles")
    .select("id")
    .eq("role", "admin");
  if (error) throw error;
  if (admins?.length) {
    console.log(
      "An administrator already exists. Bootstrap is closed; use the admin invitation workflow.",
    );
    return;
  }
  const user = await ensureAuthUser(email, password);
  const { error: provisionError } = await client.rpc("provision_staff", {
    p_user_id: user.id,
    p_gym_id: randomUUID(),
    p_name: "管理員",
    p_role: "admin",
    p_bootstrap: true,
    p_currency: process.env.GYM_CURRENCY || "TWD",
  });
  if (provisionError) throw provisionError;
  console.log(
    "First administrator created. Sign in with BOOTSTRAP_EMAIL and the password you supplied. Remove the password from your environment afterward.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
