import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
async function account(index: number) {
  if (process.env.DEV_SEED_PASSWORD)
    return {
      email: index === 0 ? "admin@kilo.example" : `coach${index}@kilo.example`,
      password: process.env.DEV_SEED_PASSWORD,
    };
  try {
    return (
      JSON.parse(await readFile(".local/demo-accounts.json", "utf8")) as {
        email: string;
        password: string;
      }[]
    )[index];
  } catch {
    throw new Error(
      "Full browser tests require a real seeded Supabase project. Run npm run db:local, db:env, and seed first; no mock authentication is used.",
    );
  }
}
async function login(page: Page, index: number) {
  const user = await account(index);
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(user.email);
  await page.getByLabel("密碼", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "登入工作台" }).click();
  await expect(
    page.getByRole("heading", {
      name: index === 0 ? "示範管理員，今天也一起前進。" : "我的學員",
      exact: true,
    }),
  ).toBeVisible();
}
async function confirm(dialog: Locator) {
  const notice = dialog.page().locator("[data-notice-key]");
  const previous = (await notice.count())
    ? await notice.getAttribute("data-notice-key")
    : null;
  const inspect = dialog.getByRole("button", { name: "檢查並確認" });
  if (await inspect.count()) await inspect.click();
  await dialog.getByRole("button", { name: "確認送出", exact: true }).click();
  const duplicate = dialog.getByRole("button", {
    name: "確認為另一堂課，繼續扣堂",
  });
  await expect(async () => {
    if (await duplicate.isVisible()) await duplicate.click();
    await expect(notice).toBeVisible();
    expect(await notice.getAttribute("data-notice-key")).not.toBe(previous);
  }).toPass({ timeout: 15000 });
  await expect(dialog).toBeHidden();
}
test("admin → coach purchase/attendance → transfer/substitution → reconcile/report/reverse", async ({
  page,
}, testInfo) => {
  await login(page, 0);
  await page.screenshot({
    path: `.local/previews/dashboard-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/customers");
  await page.getByRole("button", { name: "新增學員", exact: true }).click();
  const name = `流程測試 ${Date.now()}`;
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("姓名").fill(name);
  await confirm(dialog);
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);
  const customerURL = page.url();
  await page.getByRole("button", { name: "管理教練指派" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("堂數所屬教練").selectOption({ label: "教練 A" });
  await confirm(dialog);
  await login(page, 1);
  await page.goto(customerURL);
  await page.getByRole("button", { name: "新增購課方案", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("堂數", { exact: false }).first().fill("10");
  await dialog.getByLabel("價格方案").selectOption("");
  await dialog.getByLabel("每堂價格").fill("1750");
  await dialog.getByLabel("自訂價格 / 贈課原因").fill("自動化測試購課");
  await confirm(dialog);
  await expect(
    page.locator(".allocation").first().locator("strong"),
  ).toContainText("10");
  await page
    .getByRole("button", { name: "完成一堂 / 扣除一堂", exact: true })
    .click();
  await confirm(page.getByRole("dialog"));
  await expect(
    page.locator(".allocation").first().locator("strong"),
  ).toContainText("9");
  await page.getByRole("button", { name: "申請轉移堂數", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("堂數", { exact: false }).first().fill("3");
  await dialog.getByLabel("轉入教練").selectOption({ label: "教練 B" });
  await dialog.getByRole("textbox", { name: /^原因/ }).fill("自動化測試轉移");
  await confirm(dialog);
  expect((await page.request.get("/api/export?kind=payments")).status()).toBe(
    403,
  );
  await login(page, 0);
  await page.goto("/transfers");
  const requestRow = page
    .getByRole("row")
    .filter({ hasText: name })
    .filter({ hasText: "自動化測試轉移" });
  await page.getByRole("button", { name: "新增代課授權", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("學員").selectOption({ label: name });
  await dialog.getByLabel("堂數所屬教練").selectOption({ label: "教練 A" });
  await dialog.getByLabel("實際授課教練").selectOption({ label: "教練 B" });
  await dialog.getByRole("textbox", { name: /^原因/ }).fill("自動化測試代課");
  await confirm(dialog);
  await login(page, 2);
  await page.goto(customerURL);
  await page
    .getByRole("button", { name: "記錄已授權代課", exact: true })
    .click();
  await confirm(page.getByRole("dialog"));
  await login(page, 0);
  await page.goto("/transfers");
  await requestRow
    .getByRole("button", { name: "核准轉移", exact: true })
    .click();
  await confirm(page.getByRole("dialog"));
  await page.goto("/payments");
  const paymentRow = page.getByRole("row").filter({ hasText: name });
  await paymentRow.getByRole("button", { name: "更新對帳狀態" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("付款狀態").selectOption("verified");
  await dialog.getByRole("textbox", { name: /^原因/ }).fill("現金清點完成");
  await confirm(dialog);
  await expect(paymentRow.getByText("已核實", { exact: true })).toBeVisible();
  await page.goto("/reports");
  await expect(
    page.getByRole("heading", { name: "營運與財務報表" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "匯出摘要" }).click();
  expect((await download).suggestedFilename()).toBe("kilo-summary.csv");
  await page.goto(customerURL);
  const attendanceRows = page.getByRole("row").filter({ hasText: "完成課程" });
  const latest = attendanceRows.first();
  await latest.getByRole("button", { name: "沖銷交易" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /^原因/ }).fill("測試稽核沖銷");
  await confirm(dialog);
  await expect(page.getByText("沖銷", { exact: true }).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("Supabase rejects anonymous commands, direct writes, and public self-registration", async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Real Supabase configuration is required.");
  const anonymous = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await anonymous.rpc("gym_command", {
    p_operation: "settings",
    p_input: { low_balance_threshold: 99 },
    p_key: crypto.randomUUID(),
  });
  expect(error).toBeTruthy();
  const { error: signupError } = await anonymous.auth.signUp({
    email: `blocked-${Date.now()}@kilo.example`,
    password: "NotARealAccount-123456",
  });
  expect(signupError).toBeTruthy();
  const coach = await account(1),
    client = createClient(url, key, { auth: { persistSession: false } });
  const { error: loginError } = await client.auth.signInWithPassword(coach);
  expect(loginError).toBeNull();
  const { error: writeError } = await client
    .from("package_allocations")
    .update({ balance: 999 })
    .gt("balance", 0);
  expect(writeError).toBeTruthy();
  const { error: provisionError } = await client.rpc("provision_staff", {
    p_user_id: crypto.randomUUID(),
    p_gym_id: crypto.randomUUID(),
    p_name: "Intruder",
    p_role: "admin",
  });
  expect(provisionError).toBeTruthy();
});
test("administrator previews and atomically imports opening credits without fabricated payments", async ({
  page,
}) => {
  await login(page, 0);
  await page.goto("/imports");
  const coachRow = page.getByRole("row").filter({ hasText: "教練 A" }),
    coachId = (await coachRow.getByRole("cell").nth(1).textContent())!.trim();
  const external = `csv-${Date.now()}`,
    name = `匯入測試 ${external}`;
  const csv = `row_type,external_id,name,customer_external_id,coach_id,quantity\ncustomer,${external},${name},,${coachId},\nopening,${external}-lot,,${external},${coachId},2`;
  await page.getByLabel("匯入批號").fill(external);
  await page.getByLabel("或貼上 CSV 內容").fill(csv);
  await page
    .getByRole("button", { name: "驗證與預覽（不會寫入資料）" })
    .click();
  await expect(page.getByRole("heading", { name: /匯入預覽/ })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "確認原子匯入 2 筆" }).click();
  await expect(page.getByRole("status")).toContainText("匯入完成");
  await page.goto(`/customers?q=${encodeURIComponent(name)}`);
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);
  await expect(page.locator(".allocation strong").first()).toContainText("2");
  await expect(
    page.getByText("價值未知", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText("無付款資料", { exact: true })).toBeVisible();
});
