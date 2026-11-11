import "server-only";
import { createClient } from "@supabase/supabase-js";
export function supabaseAdmin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("尚未設定伺服器管理金鑰");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
