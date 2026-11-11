import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
test("administrator invites a coach; invitation and recovery links set real passwords", async ({
  page,
  context,
}) => {
  const mailURL = process.env.LOCAL_MAIL_URL;
  if (!mailURL)
    throw new Error(
      "LOCAL_MAIL_URL is required for full Auth verification; npm run db:env obtains the local mail catcher URL.",
    );
  const admin = process.env.DEV_SEED_PASSWORD
    ? { email: "admin@kilo.example", password: process.env.DEV_SEED_PASSWORD }
    : (
        JSON.parse(await readFile(".local/demo-accounts.json", "utf8")) as {
          email: string;
          password: string;
        }[]
      )[0];
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(admin.email);
  await page.getByLabel("密碼", { exact: true }).fill(admin.password);
  await page.getByRole("button", { name: "登入工作台" }).click();
  await expect(
    page.getByRole("heading", {
      name: "示範管理員，今天也一起前進。",
      exact: true,
    }),
  ).toBeVisible();
  const email = `invited-${Date.now()}@kilo.example`,
    password = `Demo-${crypto.randomUUID()}`;
  await page.goto("/coaches");
  await page.getByRole("button", { name: "邀請員工", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("姓名").fill("受邀測試教練");
  await dialog.getByLabel("電子郵件").fill(email);
  await dialog.getByRole("button", { name: "建立並寄送邀請" }).click();
  await expect(dialog.getByRole("status")).toContainText("帳號已建立");
  async function messageLink(type: "invite" | "recovery") {
    let link = "";
    await expect
      .poll(
        async () => {
          const response = await page.request.get(`${mailURL}/api/v1/messages`);
          if (!response.ok()) return false;
          const listing = (await response.json()) as {
            messages: { ID: string; To: { Address: string }[] }[];
          };
          for (const m of listing.messages.filter((m) =>
            m.To.some((to) => to.Address === email),
          )) {
            const detail = (await (
              await page.request.get(`${mailURL}/api/v1/message/${m.ID}`)
            ).json()) as { HTML: string };
            const href = detail.HTML.match(/href="([^"]+)"/i)?.[1]?.replaceAll(
              "&amp;",
              "&",
            );
            if (href?.includes(`type=${type}`)) {
              link = href;
              return true;
            }
          }
          return false;
        },
        {
          timeout: 15000,
          message: "Expected a real locally delivered authentication email",
        },
      )
      .toBe(true);
    return link;
  }
  const invitation = await messageLink("invite");
  await context.clearCookies();
  await page.goto(invitation);
  await expect(
    page.getByRole("heading", { name: "設定您的密碼" }),
  ).toBeVisible();
  await page.getByLabel(/新密碼/).fill(password);
  await page.getByRole("button", { name: "設定密碼", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "我的學員", exact: true }),
  ).toBeVisible();
  await context.clearCookies();
  await page.goto("/forgot-password");
  await page.getByLabel("電子郵件").fill(email);
  await page.getByRole("button", { name: "寄送重設連結" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "您將收到密碼重設信" }),
  ).toContainText("您將收到密碼重設信");
  const recovery = await messageLink("recovery");
  await page.goto(recovery);
  await page.getByLabel(/新密碼/).fill(`${password}-reset`);
  await page.getByRole("button", { name: "設定密碼", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "我的學員", exact: true }),
  ).toBeVisible();
});
