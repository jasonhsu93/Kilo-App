"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
export async function inviteStaff(
  _previous: string,
  form: FormData,
): Promise<string> {
  const actor = await requireAdmin();
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(100),
      email: z.email(),
      role: z.enum(["admin", "coach"]),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return "請檢查姓名、電子郵件及角色。";
  const admin = supabaseAdmin(),
    input = parsed.data;
  // Search by email server-side so a failed provision can be safely retried.
  let userId: string | undefined;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) return "無法查詢帳號，請檢查伺服器設定。";
    userId = data.users.find(
      (u) => u.email?.toLowerCase() === input.email.toLowerCase(),
    )?.id;
    if (userId || data.users.length < 1000) break;
  }
  if (!userId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      input.email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
      },
    );
    if (error || !data.user) return "邀請未完成，請檢查信箱及寄信設定後重試。";
    userId = data.user.id;
  }
  const { error } = await admin.rpc("provision_staff", {
    p_user_id: userId,
    p_gym_id: actor.gym_id,
    p_name: input.name,
    p_role: input.role,
    p_bootstrap: false,
    p_actor_id: actor.id,
  });
  if (error)
    return "帳號資料建立失敗，或已屬於其他館別／角色。可用相同信箱重試；尚未完成設定的帳號無法進入工作台。";
  revalidatePath("/coaches");
  return "帳號已建立。新邀請會寄送至員工信箱；既有帳號保留原密碼，可使用忘記密碼功能。";
}
