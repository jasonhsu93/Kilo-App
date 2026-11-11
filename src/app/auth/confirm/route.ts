import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const url = request.nextUrl,
    token = url.searchParams.get("token_hash"),
    type = url.searchParams.get("type"),
    code = url.searchParams.get("code");
  const client = await supabaseServer();
  let valid = false;
  if (token && type && ["invite", "recovery", "email"].includes(type))
    valid = !(
      await client.auth.verifyOtp({
        token_hash: token,
        type: type as EmailOtpType,
      })
    ).error;
  else if (code)
    valid = !(await client.auth.exchangeCodeForSession(code)).error;
  const next =
    url.searchParams.get("next") === "/reset-password"
      ? "/reset-password"
      : "/";
  return NextResponse.redirect(
    new URL(valid ? next : "/login?error=link", url.origin),
  );
}
