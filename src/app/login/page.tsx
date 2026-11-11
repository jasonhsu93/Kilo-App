import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { login } from "./actions";
import { isConfigured } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <div className="brand">
          <span className="brand-mark">K</span>
          <div>
            <div className="brand-name">KILO</div>
            <small>PERSONAL TRAINING</small>
          </div>
        </div>
        <div>
          <p className="eyebrow">MORE FOCUS. BETTER TRAINING.</p>
          <h1>
            專注每一次訓練，
            <br />
            其餘交給 KILO。
          </h1>
          <p>
            學員、課程與帳務，一切井然有序。
            <br />
            讓教練把時間留給真正重要的事。
          </p>
        </div>
        <small>為小型私人訓練團隊打造的日常工作台</small>
      </aside>
      <main className="auth-form-panel">
        <div className="auth-box">
          <p className="eyebrow">WELCOME BACK</p>
          <h1>歡迎回到工作台</h1>
          <p className="muted">使用管理員提供的帳號登入。</p>
          {error && (
            <p role="alert" className="alert alert-error">
              {error === "staff"
                ? "此帳號尚未啟用，請聯絡管理員。"
                : "驗證連結已失效，請重新申請。"}
            </p>
          )}
          {isConfigured() ? (
            <>
              <AuthForm action={login} />
              <div className="auth-links">
                <Link href="/forgot-password">忘記密碼？</Link>
              </div>
            </>
          ) : (
            <div className="section-space">
              <div className="alert">
                尚未連接 Supabase。請依 README
                設定環境、執行遷移並建立第一位管理員。
              </div>
              <pre className="setup-code">
                cp .env.example .env.local{"\n"}npm run db:migrate{"\n"}npm run
                bootstrap{"\n"}npm run dev
              </pre>
              <p className="muted">
                設定完成後即可使用真實資料登入；系統不提供公開註冊。
              </p>
            </div>
          )}
          <p className="muted" style={{ marginTop: 32, fontSize: 11 }}>
            內部系統 · 學員無需建立帳號
          </p>
        </div>
      </main>
    </div>
  );
}
