"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Dumbbell,
  CalendarCheck,
  Wallet,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Settings,
  CircleUserRound,
} from "lucide-react";
const adminLinks = [
  ["/", "總覽", LayoutDashboard],
  ["/customers", "學員管理", Users],
  ["/coaches", "教練團隊", Dumbbell],
  ["/sessions", "上課紀錄", CalendarCheck],
  ["/payments", "付款與對帳", Wallet],
  ["/transfers", "轉移與代課", ArrowLeftRight],
  ["/reports", "營運報表", ChartNoAxesCombined],
  ["/settings", "系統設定", Settings],
  ["/account", "帳戶", CircleUserRound],
] as const;
const coachLinks = [
  ["/customers", "我的學員", Users],
  ["/sessions", "上課紀錄", CalendarCheck],
  ["/account", "帳戶", CircleUserRound],
] as const;
export function Navigation({
  admin,
  mobile = false,
}: {
  admin: boolean;
  mobile?: boolean;
}) {
  const path = usePathname(),
    links = admin ? adminLinks : coachLinks;
  return (
    <nav
      className={mobile ? "mobile-nav" : undefined}
      aria-label={mobile ? "行動導覽" : "主要導覽"}
    >
      {(mobile && admin
        ? [
            adminLinks[0],
            adminLinks[1],
            adminLinks[3],
            adminLinks[4],
            adminLinks[5],
            adminLinks[8],
          ]
        : links
      ).map(([href, name, Icon]) => (
        <Link
          className={`nav-link ${path === href || (href !== "/" && path.startsWith(`${href}/`)) ? "active" : ""}`}
          href={href}
          key={href}
          aria-current={path === href ? "page" : undefined}
        >
          <Icon size={mobile ? 20 : 17} />
          <span>{name}</span>
        </Link>
      ))}
    </nav>
  );
}
