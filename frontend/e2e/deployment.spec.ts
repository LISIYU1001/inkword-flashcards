import { expect, test } from "@playwright/test";

test("static frontend calls the backend on a separate origin", async ({ page }) => {
  const statusRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/ai/status"),
  );

  await page.goto("/");

  const request = await statusRequest;
  expect(new URL(request.url()).origin).toBe(
    process.env.E2E_API_URL ?? "http://127.0.0.1:8100",
  );
});
