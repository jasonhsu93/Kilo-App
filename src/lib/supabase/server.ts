import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export const isConfigured = () =>
  !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
export async function supabaseServer() {
  if (!isConfigured()) throw new Error("Supabase 尚未設定，請參閱 README。");
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            /* Server Components refresh through proxy. */
          }
        },
      },
    },
  );
}
