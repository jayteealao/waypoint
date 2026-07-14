import { test, expect } from "@playwright/test";

// Smoke test: verifies the dev server starts and serves a page.
test("home page renders without errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto("/");

  // Title must not be empty
  const title = await page.title();
  expect(title.length).toBeGreaterThan(0);

  // At least one element visible in the body
  await expect(page.locator("body")).not.toBeEmpty();

  // No uncaught console errors
  expect(consoleErrors).toHaveLength(0);
});
