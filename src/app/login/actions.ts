"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
export async function login(_previous: string, form: FormData) {
  const result = z
    .object({ email: z.email(), password: z.string().min(1).max(256) })
    .safeParse(Object.fromEntries(form));
  if (!result.success) return "請輸入有效的電子郵件與密碼。";
  const { error } = await (
    await supabaseServer()
  ).auth.signInWithPassword(result.data);
  if (error) return "無法登入，請確認電子郵件與密碼。";
  redirect("/");
}
export async function logout() {
  await (await supabaseServer()).auth.signOut();
  redirect("/login");
}
export async function forgotPassword(_previous: string, form: FormData) {
  const email = z.email().safeParse(form.get("email"));
  if (!email.success) return "請輸入有效的電子郵件。";
  await (
    await supabaseServer()
  ).auth.resetPasswordForEmail(email.data, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
  });
  return "若此信箱有帳號，您將收到密碼重設信。";
}
export async function resetPassword(_previous: string, form: FormData) {
  const password = z.string().min(12).max(128).safeParse(form.get("password"));
  if (!password.success) return "密碼至少需要 12 個字元。";
  const client = await supabaseServer();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return "連結已失效，請重新申請重設密碼。";
  const { error } = await client.auth.updateUser({ password: password.data });
  if (error) return "無法更新密碼，請重試。";
  redirect("/");
}
