import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import {
  parseMoney,
  money,
  gymDate,
  taipeiToISO,
  csvCell,
  toCSV,
} from "../../src/lib/domain/format";
import { commandSchemas, importRowSchema } from "../../src/lib/domain/commands";
import { buildReport } from "../../src/lib/domain/reports";
import type { Workspace } from "../../src/lib/domain/types";
const id = "9ef313c2-4bc9-4fd5-a953-a2c93c7d1ebc";
describe("money and gym calendar", () => {
  it("parses decimal input as exact integer minor units", () => {
    expect(parseMoney("1750")).toBe(175000);
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("1890.5")).toBe(189050);
  });
  it.each(["-1", "1.001", "1e3", "NaN", "Infinity", "1,750", "1000001"])(
    "rejects invalid or out-of-range money %s",
    (v) => expect(() => parseMoney(v)).toThrow(),
  );
  it("uses the configured currency minor-unit scale", () => {
    expect(parseMoney("1750", "JPY")).toBe(1750);
    expect(parseMoney("1.125", "KWD")).toBe(1125);
    expect(() => parseMoney("1.2", "JPY")).toThrow();
  });
  it("labels unknown values separately from free credits", () => {
    expect(money(null)).toBe("價值未知");
    expect(money(0)).not.toBe(money(null));
  });
  it("uses Taipei day boundaries even when UTC is on the previous day", () => {
    expect(gymDate("2026-11-01T16:00:00Z")).toBe("2026-11-02");
    expect(gymDate("2026-10-31T16:00:00Z")).toBe("2026-11-01");
    expect(taipeiToISO("2026-11-02T09:30")).toBe("2026-11-02T01:30:00.000Z");
  });
});
describe("command validation", () => {
  const attendance = {
    customer_id: id,
    coach_id: id,
    teaching_coach_id: id,
    session_at: "2026-11-01T09:00:00+08:00",
    quantity: 1,
  };
  it("accepts positive whole attendance and requires timezone", () => {
    expect(commandSchemas.attendance.safeParse(attendance).success).toBe(true);
    expect(
      commandSchemas.attendance.safeParse({
        ...attendance,
        session_at: "2026-11-01T09:00",
      }).success,
    ).toBe(false);
  });
  it.each([0, -1, 0.5, 101])(
    "blocks invalid attendance quantity %s",
    (quantity) =>
      expect(
        commandSchemas.attendance.safeParse({ ...attendance, quantity })
          .success,
      ).toBe(false),
  );
  it("rejects caller-supplied authority and tenant fields", () => {
    expect(
      commandSchemas.attendance.safeParse({
        ...attendance,
        gym_id: id,
        actor_id: id,
        role: "admin",
      }).success,
    ).toBe(false);
  });
  it("requires audit reasons for transfers and corrections", () => {
    expect(
      commandSchemas.reverse.safeParse({ event_id: id, reason: " " }).success,
    ).toBe(false);
    expect(
      commandSchemas.transfer_request.safeParse({
        customer_id: id,
        coach_id: id,
        destination_coach_id: id,
        quantity: 1,
      }).success,
    ).toBe(false);
  });
  it("rejects contradictory opening balances and missing historical payments", () => {
    expect(
      importRowSchema.safeParse({
        row_type: "opening",
        external_id: "a",
        customer_external_id: "c",
        coach_id: id,
        quantity: 10,
        remaining: 11,
      }).success,
    ).toBe(false);
    expect(
      importRowSchema.safeParse({
        row_type: "payment",
        external_id: "p",
        package_external_id: "a",
      }).success,
    ).toBe(false);
  });
  it("ships a parseable CSV template with explicit amounts only on payment rows", () => {
    const rows = parse(readFileSync("templates/import.csv"), {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];
    expect(rows.length).toBe(4);
    for (const r of rows)
      if (r.row_type !== "payment") expect(r.amount).toBe("");
  });
});
describe("safe CSV export", () => {
  it.each(["=SUM(1,2)", "+cmd", "-1+1", "@IMPORT", " \t=1", "\ncmd"])(
    "neutralizes formulas %s",
    (v) => expect(csvCell(v)).toMatch(/^"'/),
  );
  it("escapes quotes and preserves unicode", () => {
    expect(csvCell('學員 "A"')).toBe('"學員 ""A"""');
    expect(toCSV([{ name: "陳,小明", amount: 100 }])).toContain('"陳,小明"');
  });
});
describe("reports", () => {
  const w = {
    gym: { currency: "TWD", timezone: "Asia/Taipei" },
    coaches: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    tiers: [],
    packages: [
      {
        id: "p",
        customer_id: "c",
        original_coach_id: "a",
        quantity: 10,
        unit_price: 175000,
      },
      {
        id: "u",
        customer_id: "c",
        original_coach_id: "a",
        quantity: 2,
        unit_price: null,
      },
    ],
    payments: [
      {
        id: "pay",
        package_id: "p",
        amount: 1750000,
        paid_at: "2026-11-01T02:00:00Z",
        status: "pending",
        method: "cash",
      },
    ],
    sessions: [
      {
        id: "s",
        customer_id: "c",
        teaching_coach_id: "b",
        event_id: "e",
        quantity: 3,
        session_at: "2026-11-02T02:00:00Z",
      },
    ],
    events: [],
    sessionAllocations: [{ session_id: "s", quantity: 3, unit_price: 175000 }],
    allocations: [
      { package_id: "p", coach_id: "b", balance: 7 },
      { package_id: "u", coach_id: "a", balance: 2 },
    ],
  } as unknown as Workspace;
  const range = { from: "2026-11-01", to: "2026-11-30" };
  it("separates collected cash, delivery value, unused value, and unknown value", () => {
    const r = buildReport(w, range);
    expect(r.paymentTotal).toBe(1750000);
    expect(r.deliveredValue).toBe(525000);
    expect(r.outstandingValue).toBe(1225000);
    expect(r.unknownOutstanding).toBe(2);
  });
  it("attributes sales to original coach and delivery to actual coach", () => {
    const a = buildReport(w, { ...range, coach: "a" }),
      b = buildReport(w, { ...range, coach: "b" });
    expect(a.paymentTotal).toBe(1750000);
    expect(a.deliveredQuantity).toBe(0);
    expect(b.paymentTotal).toBe(0);
    expect(b.deliveredQuantity).toBe(3);
  });
  it("excludes reversed sessions and voided payments", () => {
    const r = buildReport(
      {
        ...w,
        events: [{ reverses_event_id: "e" }] as Workspace["events"],
        payments: w.payments.map((p) => ({ ...p, status: "voided" })),
      },
      range,
    );
    expect(r.deliveredQuantity).toBe(0);
    expect(r.paymentTotal).toBe(0);
    expect(r.sessions.length).toBe(1);
    expect(r.payments.length).toBe(1);
  });
  it("limits status filters to payments and leaves unused value as current snapshot", () => {
    const r = buildReport(w, { ...range, status: "verified" });
    expect(r.paymentTotal).toBe(0);
    expect(r.deliveredQuantity).toBe(3);
    expect(r.outstandingValue).toBe(1225000);
  });
});
