"use client";
import { useActionState, useState } from "react";
import { inviteStaff } from "@/app/(workspace)/coaches/actions";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
export function InviteForm() {
  const [open, setOpen] = useState(false),
    [message, action, pending] = useActionState(inviteStaff, "");
  return (
    <>
      <Button onClick={() => setOpen(true)}>邀請員工</Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!pending) setOpen(v);
        }}
        title="邀請教練或管理員"
        description="邀請寄送後，員工需先設定密碼才能使用。"
      >
        <form action={action} className="form-stack">
          <label className="field">
            <span>姓名</span>
            <input name="name" maxLength={100} required />
          </label>
          <label className="field">
            <span>電子郵件</span>
            <input name="email" type="email" required />
          </label>
          <label className="field">
            <span>角色</span>
            <select name="role">
              <option value="coach">教練</option>
              <option value="admin">管理員（可存取所有帳務）</option>
            </select>
          </label>
          {message && (
            <div className="alert" role="status">
              {message}
            </div>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "建立中…" : "建立並寄送邀請"}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
