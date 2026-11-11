import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: [".env.local", ".env"], quiet: true });
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function ensureAuthUser(email: string, password: string) {
  const client = adminClient();
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    const user = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (user) return user;
    if (data.users.length < 1000) break;
  }
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error || new Error("User creation failed");
  return data.user;
}
