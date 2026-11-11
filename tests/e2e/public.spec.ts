import { test, expect } from "@playwright/test";
test("Traditional Chinese login is responsive and has no public registration", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "歡迎回到工作台" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(page.getByRole("link", { name: /註冊/ })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("anonymous users cannot open protected screens or export data", async ({
  page,
}) => {
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/login/);
  const response = await page.request.get("/api/export?kind=payments", {
    maxRedirects: 0,
  });
  expect([303, 307, 308]).toContain(response.status());
});
