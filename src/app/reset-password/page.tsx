import { AuthForm } from "@/components/auth-form";
import { resetPassword } from "../login/actions";
export default function ResetPage() {
  return (
    <main className="auth-form-panel" style={{ minHeight: "100dvh" }}>
      <div className="auth-box">
        <h1>設定您的密碼</h1>
        <p className="muted">請使用至少 12 個字元的密碼。</p>
        <AuthForm action={resetPassword} mode="reset" />
      </div>
    </main>
  );
}
