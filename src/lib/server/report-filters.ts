import "server-only";
import { z } from "zod";
import { gymDate } from "@/lib/domain/format";
import type { ReportFilters } from "@/lib/domain/reports";
export function parseFilters(
  input: Record<string, string | undefined>,
): ReportFilters {
  const today = gymDate(),
    date = (v: string | undefined, def: string) =>
      z.iso.date().safeParse(v).success ? v! : def;
  const from = date(input.from, `${today.slice(0, 7)}-01`),
    to = date(input.to, today);
  return {
    from: from <= to ? from : to,
    to: from <= to ? to : from,
    coach: z.uuid().safeParse(input.coach).success ? input.coach : undefined,
    customer: z.uuid().safeParse(input.customer).success
      ? input.customer
      : undefined,
    status: ["pending", "verified", "disputed", "voided"].includes(
      input.status || "",
    )
      ? input.status
      : undefined,
  };
}
