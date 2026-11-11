import { requireStaff } from "@/lib/server/auth";
import { logout } from "@/app/login/actions";
import { Notifications } from "@/components/notifications";
import { Navigation } from "@/components/navigation";
import { gymDate } from "@/lib/domain/format";
import { LogOut } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireStaff(),
    admin = staff.role === "admin";
  return (
    <>
      <Notifications />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">K</span>
          <div>
            <div className="brand-name">KILO</div>
            <small>TRAINING MANAGEMENT</small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <Navigation admin={admin} />
        <div className="sidebar-footer">
          <div className="staff">
            <span className="avatar">{staff.name.slice(0, 1)}</span>
            <div>
              {staff.name}
              <small>{admin ? "管理員" : "私人教練"}</small>
            </div>
          </div>
          <form action={logout}>
            <button className="button button-ghost" type="submit">
              <LogOut size={15} />
              登出
            </button>
          </form>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="crumb">
            KILO 私人訓練 <span aria-hidden> / </span>{" "}
            {admin ? "管理中心" : "教練工作台"}
          </span>
          <div className="topbar-right">
            <span className="online">
              <i />
              安全工作階段
            </span>
            <span className="muted" style={{ fontSize: 11 }}>
              {gymDate()}
            </span>
            <span className="avatar">{staff.name.slice(0, 1)}</span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      <Navigation admin={admin} mobile />
    </>
  );
}
