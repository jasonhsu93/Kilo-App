import type { Workspace } from "@/lib/domain/types";
import type { ReportFilters as Filters } from "@/lib/domain/reports";
import { Button } from "./ui/button";
export function ReportFilters({
  w,
  filters,
  status = false,
}: {
  w: Workspace;
  filters: Filters;
  status?: boolean;
}) {
  return (
    <form className="toolbar">
      <input
        name="from"
        type="date"
        aria-label="起始日期"
        defaultValue={filters.from}
      />
      <span className="muted">至</span>
      <input
        name="to"
        type="date"
        aria-label="結束日期"
        defaultValue={filters.to}
      />
      <select name="coach" aria-label="教練" defaultValue={filters.coach || ""}>
        <option value="">所有教練</option>
        {w.coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        name="customer"
        aria-label="學員"
        defaultValue={filters.customer || ""}
      >
        <option value="">所有學員</option>
        {w.customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {status && (
        <select
          name="status"
          aria-label="付款狀態"
          defaultValue={filters.status || ""}
        >
          <option value="">所有付款狀態</option>
          <option value="pending">待對帳</option>
          <option value="verified">已核實</option>
          <option value="disputed">有爭議</option>
          <option value="voided">已作廢</option>
        </select>
      )}
      <Button type="submit" variant="outline">
        套用篩選
      </Button>
    </form>
  );
}
