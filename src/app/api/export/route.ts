import { requireStaff } from "@/lib/server/auth";
import { loadWorkspace } from "@/lib/server/repository";
import { parseFilters } from "@/lib/server/report-filters";
import { buildReport } from "@/lib/domain/reports";
import { coachName, customerName, isReversed } from "@/lib/domain/selectors";
import { gymDate, toCSV } from "@/lib/domain/format";
export async function GET(request: Request) {
  const staff = await requireStaff();
  if (staff.role !== "admin") return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url),
    w = await loadWorkspace(),
    f = parseFilters(Object.fromEntries(url.searchParams)),
    r = buildReport(w, f),
    kind = url.searchParams.get("kind");
  let rows: Record<string, unknown>[];
  if (kind === "payments")
    rows = r.payments.map((p) => {
      const pkg = w.packages.find((k) => k.id === p.package_id)!;
      return {
        payment_id: p.id,
        customer: customerName(w, pkg.customer_id),
        original_coach: coachName(w, pkg.original_coach_id),
        paid_at: p.paid_at,
        currency: w.gym.currency,
        amount_minor: p.amount,
        method: p.method,
        status: p.status,
        recorded_by: coachName(w, p.recorded_by),
        verified_by: p.verified_by ? coachName(w, p.verified_by) : "",
        verified_at: p.verified_at,
      };
    });
  else if (kind === "sessions")
    rows = r.sessions.map((s) => ({
      session_id: s.id,
      customer: s.customer_name,
      session_at: s.session_at,
      teaching_coach: coachName(w, s.teaching_coach_id),
      owning_coach: coachName(w, s.owning_coach_id),
      quantity: s.quantity,
      remaining_snapshot: s.remaining_after,
      recorded_by: coachName(w, s.recorded_by),
      reversed: isReversed(w, s.event_id),
      notes: s.notes,
    }));
  else if (kind === "monthly") {
    const grouped = new Map<
      string,
      { month: string; coach: string; quantity: number }
    >();
    for (const s of r.delivered) {
      const month = gymDate(s.session_at).slice(0, 7),
        key = `${month}:${s.teaching_coach_id}`,
        row = grouped.get(key) || {
          month,
          coach: coachName(w, s.teaching_coach_id),
          quantity: 0,
        };
      row.quantity += s.quantity;
      grouped.set(key, row);
    }
    rows = [...grouped.values()];
  } else if (kind === "summary")
    rows = [
      {
        from: f.from,
        to: f.to,
        currency: w.gym.currency,
        payments_recorded_minor: r.paymentTotal,
        verified_minor: r.verified,
        pending_minor: r.pending,
        disputed_minor: r.disputed,
        delivered_classes: r.deliveredQuantity,
        delivered_attributed_value_minor: r.deliveredValue,
        unknown_value_delivered_classes: r.unknownDelivered,
        current_unused_classes: r.outstandingQuantity,
        current_unused_attributed_value_minor: r.outstandingValue,
        unknown_value_unused_classes: r.unknownOutstanding,
      },
    ];
  else return new Response("Unknown export", { status: 400 });
  return new Response(toCSV(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kilo-${kind}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
