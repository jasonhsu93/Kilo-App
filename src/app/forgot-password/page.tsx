import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { forgotPassword } from "../login/actions";
export default function ForgotPage() {
  return (
    <main className="auth-form-panel" style={{ minHeight: "100dvh" }}>
      <div className="auth-box">
        <h1>重設密碼</h1>
        <p className="muted">輸入您的員工電子郵件，我們將寄送重設連結。</p>
        <AuthForm action={forgotPassword} mode="forgot" />
        <div className="auth-links">
          <Link href="/login">返回登入</Link>
        </div>
      </div>
    </main>
  );
}
