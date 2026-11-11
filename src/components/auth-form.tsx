"use client";
import { useActionState } from "react";
import { Button } from "./ui/button";
export function AuthForm({
  action,
  mode = "login",
}: {
  action: (state: string, form: FormData) => Promise<string>;
  mode?: "login" | "forgot" | "reset";
}) {
  const [message, formAction, pending] = useActionState(action, "");
  return (
    <form action={formAction} className="form-stack">
      {mode !== "reset" && (
        <label className="field">
          <span>電子郵件</span>
          <input type="email" name="email" autoComplete="email" required />
        </label>
      )}
      {mode !== "forgot" && (
        <label className="field">
          <span>{mode === "reset" ? "新密碼（至少 12 個字元）" : "密碼"}</span>
          <input
            type="password"
            name="password"
            minLength={mode === "reset" ? 12 : 1}
            maxLength={128}
            autoComplete={
              mode === "reset" ? "new-password" : "current-password"
            }
            required
          />
        </label>
      )}
      {message && (
        <p role="alert" className="alert">
          {message}
        </p>
      )}
      <Button disabled={pending} type="submit">
        {pending
          ? "處理中…"
          : mode === "login"
            ? "登入工作台"
            : mode === "forgot"
              ? "寄送重設連結"
              : "設定密碼"}
      </Button>
    </form>
  );
}
