import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { loadWorkspace } from "@/lib/server/repository";
import { customerBalance, coachName } from "@/lib/domain/selectors";
import { PageHeader, Empty } from "@/components/data";
import { CommandForm } from "@/components/command-form";
import { Button } from "@/components/ui/button";
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; coach?: string }>;
}) {
  const w = await loadWorkspace(),
    params = await searchParams,
    admin = w.profile.role === "admin";
  const customers = w.customers
    .filter(
      (c) =>
        (!params.q ||
          c.name.toLocaleLowerCase().includes(params.q.toLocaleLowerCase())) &&
        (params.status === "all" ||
          (params.status === "inactive" ? !c.active : c.active)) &&
        (!params.coach ||
          w.assignments.some(
            (a) =>
              a.customer_id === c.id && a.coach_id === params.coach && a.active,
          )),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "zh-TW"));
  return (
    <>
      <PageHeader
        eyebrow="PEOPLE FIRST"
        title={admin ? "學員管理" : "我的學員"}
        description={`目前可查看 ${w.customers.filter((c) => c.active).length} 位活躍學員，點選學員即可完成扣堂或新增方案。`}
        actions={
          admin ? (
            <>
              <Button asChild variant="outline">
                <Link href="/imports">CSV 匯入</Link>
              </Button>
              <CommandForm
                operation="customer_save"
                title="新增學員"
                fields={[
                  { name: "name", label: "姓名", required: true },
                  { name: "phone", label: "電話" },
                  { name: "email", label: "電子郵件", type: "email" },
                  { name: "notes", label: "備註", type: "textarea" },
                ]}
              />
            </>
          ) : undefined
        }
      />
      <form className="toolbar">
        <input
          type="search"
          name="q"
          placeholder="搜尋學員姓名…"
          aria-label="搜尋學員姓名"
          defaultValue={params.q}
        />
        <select
          name="status"
          aria-label="學員狀態"
          defaultValue={params.status || "active"}
        >
          <option value="active">啟用中的學員</option>
          <option value="inactive">已停用的學員</option>
          <option value="all">所有狀態</option>
        </select>
        {admin && (
          <select
            name="coach"
            aria-label="指派教練"
            defaultValue={params.coach}
          >
            <option value="">所有教練</option>
            {w.coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <Button variant="outline" type="submit">
          搜尋
        </Button>
      </form>
      {customers.length ? (
        <div className="customer-grid">
          {customers.map((c) => {
            const balance = customerBalance(w, c.id);
            return (
              <Link
                href={`/customers/${c.id}`}
                key={c.id}
                className="card customer-card"
              >
                <div className="customer-card-top">
                  <span className="avatar">{c.name.slice(0, 1)}</span>
                  <div>
                    <h2>
                      {c.name}{" "}
                      {!c.active && <span className="badge">已停用</span>}
                    </h2>
                    <small>
                      {w.assignments
                        .filter((a) => a.customer_id === c.id && a.active)
                        .map((a) => coachName(w, a.coach_id))
                        .join("、") || "待指派教練"}
                    </small>
                  </div>
                </div>
                <div className="customer-card-bottom">
                  <div>
                    <small>{admin ? "剩餘堂數" : "我的剩餘堂數"}</small>
                    <div
                      className={`balance-number ${balance <= w.threshold ? "low" : ""}`}
                    >
                      {balance} <small>堂</small>
                    </div>
                  </div>
                  <span className="card-link">
                    查看學員{" "}
                    <ArrowUpRight size={14} style={{ display: "inline" }} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <Empty>
          找不到符合條件的學員。請調整搜尋條件，或由管理員新增並指派學員。
        </Empty>
      )}
    </>
  );
}
