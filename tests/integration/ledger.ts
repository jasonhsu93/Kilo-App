import { Client } from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function integrationTests(db: Client, url: string) {
  const gym = randomUUID(),
    admin = randomUUID(),
    coach = randomUUID(),
    other = randomUUID(),
    customer = randomUUID(),
    outsider = randomUUID(),
    otherGym = randomUUID();
  await db.query(`insert into auth.users(id) values($1),($2),($3),($4)`, [
    admin,
    coach,
    other,
    outsider,
  ]);
  await db.query(
    `insert into public.gyms(id,name) values($1,'Test gym'),($2,'Other gym')`,
    [gym, otherGym],
  );
  await db.query(
    `insert into public.user_profiles(id,gym_id,name,role) values($1,$4,'Admin','admin'),($2,$4,'Coach A','coach'),($3,$4,'Coach B','coach'),($5,$6,'Outsider','coach')`,
    [admin, coach, other, gym, outsider, otherGym],
  );
  await db.query(
    `insert into public.coaches(id,gym_id,name) values($1,$3,'Coach A'),($2,$3,'Coach B'),($4,$5,'Outsider')`,
    [coach, other, gym, outsider, otherGym],
  );
  await db.query(`insert into public.gym_settings(gym_id) values($1)`, [gym]);
  await db.query(
    `insert into public.customers(id,gym_id,name) values($1,$2,'Mandy')`,
    [customer, gym],
  );
  await db.query(
    `insert into public.customer_coach_assignments(gym_id,customer_id,coach_id) values($1,$2,$3)`,
    [gym, customer, coach],
  );
  const now = new Date().toISOString();
  const base = { customer_id: customer, coach_id: coach };
  async function asUser<T>(
    who: string,
    fn: (c: Client) => Promise<T>,
  ): Promise<T> {
    const c = new Client(url);
    await c.connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [
        who,
      ]);
      const out = await fn(c);
      await c.query("commit");
      return out;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      await c.end();
    }
  }
  const command = (
    who: string,
    op: string,
    input: Record<string, unknown>,
    key = randomUUID(),
  ) =>
    asUser(
      who,
      async (c) =>
        (
          await c.query("select public.gym_command($1,$2,$3) result", [
            op,
            JSON.stringify(input),
            key,
          ])
        ).rows[0].result as { id: string; event_id: string; balance: number },
    );
  const balance = async (co = coach) =>
    Number(
      (
        await db.query(
          `select coalesce(sum(pa.balance),0) b from public.package_allocations pa join public.packages p on p.id=pa.package_id where p.customer_id=$1 and pa.coach_id=$2`,
          [customer, co],
        )
      ).rows[0].b,
    );
  let passed = 0;
  async function test(name: string, fn: () => Promise<void>) {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  }
  let purchase: { id: string; event_id: string };
  await test("purchase creates 10 credits and a pending payment", async () => {
    purchase = await command(coach, "purchase", {
      ...base,
      quantity: 10,
      unit_price: 175000,
      reason: "Custom tier",
      method: "cash",
      purchased_at: now,
    });
    assert.equal(await balance(), 10);
    const p = (
      await db.query("select * from public.payments where package_id=$1", [
        purchase.id,
      ])
    ).rows[0];
    assert.equal(Number(p.amount), 1750000);
    assert.equal(p.status, "pending");
  });
  const sessionInput = {
    ...base,
    quantity: 1,
    teaching_coach_id: coach,
    session_at: now,
    acknowledge_duplicate: true,
  };
  let session: { id: string; event_id: string };
  await test("attendance consumes one FIFO credit and stores package allocation", async () => {
    session = await command(coach, "attendance", sessionInput);
    assert.equal(await balance(), 9);
    assert.equal(
      (
        await db.query(
          "select quantity from public.session_allocations where session_id=$1",
          [session.id],
        )
      ).rows[0].quantity,
      1,
    );
  });
  await test("insufficient credits are blocked atomically", async () => {
    await assert.rejects(
      command(coach, "attendance", { ...sessionInput, quantity: 10 }),
      /INSUFFICIENT_CREDITS/,
    );
    assert.equal(await balance(), 9);
  });
  await test("same-day attendance requires acknowledgement", async () => {
    await assert.rejects(
      command(coach, "attendance", {
        ...sessionInput,
        acknowledge_duplicate: false,
      }),
      /DUPLICATE_DAY_CONFIRMATION/,
    );
  });
  await test("concurrent identical retries produce one deduction", async () => {
    const key = randomUUID();
    const out = await Promise.all([
      command(coach, "attendance", sessionInput, key),
      command(coach, "attendance", sessionInput, key),
    ]);
    assert.equal(out[0].id, out[1].id);
    assert.equal(await balance(), 8);
    await assert.rejects(
      command(coach, "attendance", { ...sessionInput, quantity: 2 }, key),
      /IDEMPOTENCY_CONFLICT/,
    );
  });
  await test("concurrent deductions cannot overspend", async () => {
    const out = await Promise.allSettled([
      command(coach, "attendance", { ...sessionInput, quantity: 5 }),
      command(coach, "attendance", { ...sessionInput, quantity: 5 }),
    ]);
    assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(await balance(), 3);
  });
  let transfer: { id: string; event_id: string };
  await test("partial transfer preserves total and creates no payment", async () => {
    const n = (await db.query("select count(*) from public.payments")).rows[0]
      .count;
    const req = await command(coach, "transfer_request", {
      ...base,
      quantity: 2,
      destination_coach_id: other,
      reason: "Customer request",
    });
    await assert.rejects(
      command(coach, "transfer_decide", {
        transfer_id: req.id,
        decision: "approved",
      }),
      /FORBIDDEN/,
    );
    transfer = await command(admin, "transfer_decide", {
      transfer_id: req.id,
      decision: "approved",
    });
    assert.equal(await balance(), 1);
    assert.equal(await balance(other), 2);
    assert.equal(
      (await db.query("select count(*) from public.payments")).rows[0].count,
      n,
    );
  });
  await test("full transfer retains immutable package provenance", async () => {
    const req = await command(admin, "transfer_request", {
      ...base,
      quantity: 1,
      destination_coach_id: other,
      reason: "Remaining balance",
    });
    await command(admin, "transfer_decide", {
      transfer_id: req.id,
      decision: "approved",
    });
    assert.equal(await balance(), 0);
    assert.equal(await balance(other), 3);
    const p = (
      await db.query("select * from public.packages where id=$1", [
        purchase!.id,
      ])
    ).rows[0];
    assert.equal(p.original_coach_id, coach);
    assert.equal(p.quantity, 10);
    assert.equal(Number(p.unit_price), 175000);
  });
  await test("approved substitution consumes owner credits without a transfer and cannot be reused", async () => {
    const date = (
      await db.query("select (now() at time zone 'Asia/Taipei')::date::text d")
    ).rows[0].d;
    const sub = await command(admin, "substitution", {
      customer_id: customer,
      coach_id: other,
      teaching_coach_id: coach,
      quantity: 1,
      session_date: date,
      reason: "Cover",
    });
    const input = {
      customer_id: customer,
      coach_id: other,
      teaching_coach_id: coach,
      quantity: 1,
      session_at: now,
      substitution_id: sub.id,
      acknowledge_duplicate: true,
    };
    const delivered = await command(coach, "attendance", input);
    assert.equal(
      await asUser(
        coach,
        async (c2) =>
          (
            await c2.query(
              "select * from public.session_allocations where session_id=$1",
              [delivered.id],
            )
          ).rowCount,
      ),
      0,
    );
    assert.equal(await balance(), 0);
    assert.equal(await balance(other), 2);
    await assert.rejects(
      command(coach, "attendance", input),
      /SUBSTITUTION_REQUIRED/,
    );
  });
  await test("unrelated coach and cross-tenant access are denied", async () => {
    assert.equal(
      await asUser(
        outsider,
        async (c) =>
          (
            await c.query("select * from public.customers where id=$1", [
              customer,
            ])
          ).rowCount,
      ),
      0,
    );
    await assert.rejects(
      command(outsider, "purchase", {
        ...base,
        quantity: 1,
        unit_price: 0,
        reason: "Gift",
        method: "cash",
        purchased_at: now,
      }),
      /NOT_FOUND/,
    );
  });
  await test("coach cannot verify payments or write ledger directly", async () => {
    const pay = (
      await db.query("select id from public.payments where package_id=$1", [
        purchase!.id,
      ])
    ).rows[0];
    await assert.rejects(
      command(coach, "reconcile", {
        payment_id: pay.id,
        status: "verified",
        reason: "Received",
      }),
      /FORBIDDEN/,
    );
    await assert.rejects(
      asUser(coach, (c) =>
        c.query("update public.package_allocations set balance=100"),
      ),
      /permission denied/,
    );
    await assert.rejects(
      asUser(coach, (c) =>
        c.query(
          "insert into public.credit_ledger_entries(gym_id,event_id,allocation_id,delta,balance_after) values($1,$2,$3,1,1)",
          [gym, randomUUID(), randomUUID()],
        ),
      ),
      /permission denied/,
    );
    await command(admin, "reconcile", {
      payment_id: pay.id,
      status: "verified",
      reason: "Cash counted",
    });
  });
  await test("reversal restores exact allocations and preserves original history", async () => {
    const before = await balance();
    await command(admin, "reverse", {
      event_id: session!.event_id,
      reason: "Mistaken attendance",
    });
    assert.equal(await balance(), before + 1);
    assert.equal(
      (
        await db.query("select count(*) from public.sessions where id=$1", [
          session!.id,
        ])
      ).rows[0].count,
      "1",
    );
    await assert.rejects(
      command(admin, "reverse", {
        event_id: session!.event_id,
        reason: "Again",
      }),
      /ALREADY_REVERSED/,
    );
  });
  await test("dependent purchase reversal is blocked", async () => {
    await assert.rejects(
      command(admin, "reverse", {
        event_id: purchase!.event_id,
        reason: "Incorrect purchase",
      }),
      /REVERSAL_DEPENDENCIES/,
    );
  });
  await test("complimentary credits never fabricate payment", async () => {
    const p = await command(coach, "purchase", {
      ...base,
      quantity: 2,
      unit_price: 0,
      reason: "Welcome gift",
      method: "cash",
      purchased_at: now,
    });
    assert.equal(
      (
        await db.query(
          "select count(*) from public.payments where package_id=$1",
          [p.id],
        )
      ).rows[0].count,
      "0",
    );
    await command(admin, "reverse", {
      event_id: p.event_id,
      reason: "Wrong gift",
    });
  });
  await test("monthly cash collections differ from delivered-session value", async () => {
    const total = Number(
      (
        await db.query(
          "select sum(amount) n from public.payments where status<>'voided'",
        )
      ).rows[0].n,
    );
    const delivered = Number(
      (
        await db.query(
          "select sum(sa.quantity*sa.unit_price) n from public.session_allocations sa join public.sessions s on s.id=sa.session_id where not exists(select 1 from public.credit_events e where e.reverses_event_id=s.event_id)",
        )
      ).rows[0].n,
    );
    assert.equal(total, 1750000);
    assert.notEqual(total, delivered);
    assert.equal(delivered, 1225000);
  });
  await test("inactive customer retains history and blocks new attendance", async () => {
    await command(admin, "customer_save", {
      customer_id: customer,
      name: "Mandy",
      active: false,
    });
    assert.equal(
      (
        await db.query(
          "select count(*) from public.packages where customer_id=$1",
          [customer],
        )
      ).rows[0].count,
      "2",
    );
    await assert.rejects(
      command(coach, "attendance", sessionInput),
      /CUSTOMER_INACTIVE/,
    );
    await command(admin, "customer_save", {
      customer_id: customer,
      name: "Mandy",
      active: true,
    });
  });
  await test("last administrator cannot be disabled", async () => {
    await assert.rejects(
      command(admin, "staff_status", { staff_id: admin, active: false }),
      /LAST_ADMIN/,
    );
  });
  await test("imports are atomic, auditable, repeat-safe, and retain unknown value", async () => {
    const input = {
      batch_id: "opening-1",
      rows: [
        {
          row_type: "customer",
          external_id: "import-customer",
          name: "Imported",
          coach_id: coach,
        },
        {
          row_type: "opening",
          external_id: "import-package",
          customer_external_id: "import-customer",
          coach_id: coach,
          quantity: 4,
        },
      ],
    };
    const first = await command(admin, "import", input);
    const again = await command(admin, "import", input);
    assert.equal(first.id, again.id);
    assert.equal(
      (
        await db.query(
          "select unit_price from public.packages where external_id='import-package'",
        )
      ).rows[0].unit_price,
      null,
    );
    await assert.rejects(
      command(admin, "import", {
        batch_id: "invalid-import",
        rows: [
          {
            row_type: "customer",
            external_id: "rollback-customer",
            name: "Rollback",
          },
          {
            row_type: "opening",
            external_id: "bad-package",
            customer_external_id: "rollback-customer",
            coach_id: outsider,
            quantity: 4,
          },
        ],
      }),
      /IMPORT_INVALID_COACH/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*) from public.customers where external_id='rollback-customer'",
        )
      ).rows[0].count,
      "0",
    );
  });
  await test("concurrent approvals execute a transfer once", async () => {
    const req = await command(admin, "transfer_request", {
      ...base,
      quantity: 1,
      destination_coach_id: other,
      reason: "Concurrency",
    });
    const out = await Promise.allSettled([
      command(admin, "transfer_decide", {
        transfer_id: req.id,
        decision: "approved",
      }),
      command(admin, "transfer_decide", {
        transfer_id: req.id,
        decision: "approved",
      }),
    ]);
    assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
  });
  await test("substitute read model exposes no private notes or package prices", async () => {
    const c = await command(admin, "customer_save", {
      name: "Private substitute customer",
      notes: "CONFIDENTIAL",
    });
    await command(admin, "assignment", {
      customer_id: c.id,
      coach_id: coach,
      active: true,
    });
    await command(coach, "purchase", {
      customer_id: c.id,
      coach_id: coach,
      quantity: 2,
      unit_price: 175000,
      reason: "Custom",
      method: "cash",
      purchased_at: now,
    });
    const date = (
      await db.query("select (now() at time zone 'Asia/Taipei')::date::text d")
    ).rows[0].d;
    const sub = await command(admin, "substitution", {
      customer_id: c.id,
      coach_id: coach,
      teaching_coach_id: other,
      quantity: 1,
      session_date: date,
      reason: "Cover",
    });
    assert.equal(
      await asUser(
        other,
        async (c2) =>
          (await c2.query("select * from public.customers where id=$1", [c.id]))
            .rowCount,
      ),
      0,
    );
    assert.equal(
      await asUser(
        other,
        async (c2) =>
          (
            await c2.query(
              "select * from public.packages where customer_id=$1",
              [c.id],
            )
          ).rowCount,
      ),
      0,
    );
    const context = await asUser(
      other,
      async (c2) =>
        (
          await c2.query(
            "select * from public.substitution_context where id=$1",
            [sub.id],
          )
        ).rows[0],
    );
    assert.equal(context.customer_name, "Private substitute customer");
    assert.equal(context.owning_balance, 2);
    assert.equal(context.notes, undefined);
  });
  await test("FIFO spans differently priced packages and snapshots exact consumed value", async () => {
    const c = await command(admin, "customer_save", { name: "FIFO customer" });
    await command(admin, "assignment", {
      customer_id: c.id,
      coach_id: coach,
      active: true,
    });
    const first = await command(coach, "purchase", {
      customer_id: c.id,
      coach_id: coach,
      quantity: 2,
      unit_price: 200000,
      reason: "First price",
      method: "cash",
      purchased_at: "2026-10-01T00:00:00Z",
    });
    const second = await command(coach, "purchase", {
      customer_id: c.id,
      coach_id: coach,
      quantity: 2,
      unit_price: 175000,
      reason: "Second price",
      method: "bank",
      purchased_at: now,
    });
    const s2 = await command(coach, "attendance", {
      customer_id: c.id,
      coach_id: coach,
      teaching_coach_id: coach,
      quantity: 3,
      session_at: now,
      acknowledge_duplicate: true,
    });
    const parts = (
      await db.query(
        "select quantity,unit_price from public.session_allocations where session_id=$1 order by unit_price desc",
        [s2.id],
      )
    ).rows;
    assert.deepEqual(
      parts.map((p) => [p.quantity, Number(p.unit_price)]),
      [
        [2, 200000],
        [1, 175000],
      ],
    );
    await command(admin, "reverse", {
      event_id: s2.event_id,
      reason: "Restore exact lots",
    });
    await command(admin, "reverse", {
      event_id: first.event_id,
      reason: "Void paid purchase",
    });
    const payment = (
      await db.query("select status from public.payments where package_id=$1", [
        first.id,
      ])
    ).rows[0];
    assert.equal(payment.status, "voided");
    assert.equal(
      (
        await db.query(
          "select balance from public.package_allocations where package_id=$1",
          [second.id],
        )
      ).rows[0].balance,
      2,
    );
  });
  await test("cross-tenant coach targets and direct privileged helpers are denied", async () => {
    await assert.rejects(
      command(admin, "transfer_request", {
        ...base,
        quantity: 1,
        destination_coach_id: outsider,
        reason: "Wrong gym",
      }),
      /INVALID_COACH/,
    );
    await assert.rejects(
      asUser(coach, (c2) =>
        c2.query("select private.entry($1,$2,$3,100)", [
          gym,
          randomUUID(),
          randomUUID(),
        ]),
      ),
      /permission denied/,
    );
    await assert.rejects(
      asUser(coach, (c2) =>
        c2.query("select public.provision_staff($1,$2,$3,$4)", [
          randomUUID(),
          gym,
          "Intruder",
          "admin",
        ]),
      ),
      /permission denied/,
    );
  });
  await test("deactivated staff are blocked immediately even with an existing identity claim", async () => {
    await command(admin, "staff_status", { staff_id: other, active: false });
    await assert.rejects(
      command(other, "attendance", {
        ...sessionInput,
        coach_id: other,
        teaching_coach_id: other,
      }),
      /UNAUTHORIZED/,
    );
    assert.equal(
      await asUser(
        other,
        async (c2) =>
          (await c2.query("select * from public.customers")).rowCount,
      ),
      0,
    );
    await command(admin, "staff_status", { staff_id: other, active: true });
  });
  await test("admin transfers departed-coach credits without reactivating their account", async () => {
    const c = await command(admin, "customer_save", {
      name: "Departed coach customer",
    });
    await command(admin, "assignment", {
      customer_id: c.id,
      coach_id: coach,
      active: true,
    });
    await command(coach, "purchase", {
      customer_id: c.id,
      coach_id: coach,
      quantity: 1,
      unit_price: 0,
      reason: "Test credit",
      method: "cash",
      purchased_at: now,
    });
    await command(admin, "staff_status", { staff_id: coach, active: false });
    await command(admin, "assignment", {
      customer_id: c.id,
      coach_id: coach,
      active: false,
    });
    const req = await command(admin, "transfer_request", {
      customer_id: c.id,
      coach_id: coach,
      quantity: 1,
      destination_coach_id: other,
      reason: "Coach departed",
    });
    await command(admin, "transfer_decide", {
      transfer_id: req.id,
      decision: "approved",
    });
    const total = Number(
      (
        await db.query(
          "select sum(pa.balance) b from public.package_allocations pa join public.packages p on p.id=pa.package_id where p.customer_id=$1",
          [c.id],
        )
      ).rows[0].b,
    );
    assert.equal(total, 1);
    assert.equal(
      (
        await db.query("select active from public.user_profiles where id=$1", [
          coach,
        ])
      ).rows[0].active,
      false,
    );
    await command(admin, "staff_status", { staff_id: coach, active: true });
  });
  await test("allocation projections always equal the immutable ledger", async () => {
    const mismatches = await db.query(
      "select pa.id from public.package_allocations pa left join public.credit_ledger_entries l on l.allocation_id=pa.id group by pa.id having pa.balance<>coalesce(sum(l.delta),0)",
    );
    assert.equal(mismatches.rowCount, 0);
    await assert.rejects(
      db.query("update public.credit_ledger_entries set delta=100"),
      /IMMUTABLE_HISTORY/,
    );
  });
  console.log(`\n${passed} PostgreSQL integration tests passed.`);
}
