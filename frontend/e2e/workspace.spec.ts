import { test, expect } from "@playwright/test";

const sample = process.env.WPS_TEST_PDF;
test.skip(!sample, "Set WPS_TEST_PDF to the user-owned WPS test PDF.");

test("real upload, edit, original evidence, add/delete, confirm, reload and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("选择 PDF 文件").setInputFiles(sample!);
  await expect(page.getByLabel("词条 9", { exact: true })).toHaveValue(
    "top-ups",
  );
  await expect(page.getByLabel("词条 1", { exact: true })).toHaveValue(
    "daunting",
  );
  await page.getByLabel("词条 1", { exact: true }).fill("daunting edited");
  await page.getByLabel("词条 1 页码", { exact: true }).fill("2");
  await page.getByRole("button", { name: "手动添加词条", exact: true }).click();
  await page.getByLabel("词条 10", { exact: true }).fill("lifelong learning");
  await page.getByRole("button", { name: "删除词条 10", exact: true }).click();
  await page.getByRole("button", { name: "确认并保存", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "已确认" }),
  ).toBeVisible();
  const record = await page.evaluate(
    () => JSON.parse(localStorage.getItem("inkword.library.v1")!).articles[0],
  );
  expect(record.entries).toHaveLength(9);
  expect(record.entries[0].source_page).toBe(1);
  expect(record.entries[0].page).toBe(2);
  expect(record.entries[0].raw_text).toBe("daunting");
  await page.reload();
  await page
    .getByRole("button", { name: /打开文章/ })
    .first()
    .click();
  await expect(page.getByLabel("词条 1", { exact: true })).toHaveValue(
    "daunting edited",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  expect((await download).suggestedFilename()).toBe("inkword-backup.json");
  expect(errors).toEqual([]);
});

test("pending upload cannot open another article and discard edits", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("选择 PDF 文件").setInputFiles(sample!);
  await expect(page.getByLabel("词条 9", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "阅读空间", exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/parse", async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByLabel("选择 PDF 文件").setInputFiles(sample!);
  await expect(
    page.getByRole("heading", { name: "正在读取高亮与原文…" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /打开文章/ })
    .first()
    .click();
  const count = await page
    .getByRole("heading", { name: "让每个词，回到语境里。" })
    .count();
  release();
  expect(count).toBe(0);
  await expect(page.getByLabel("词条 9", { exact: true })).toBeVisible();
});

test("invalid PDF is actionable; mobile has no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("选择 PDF 文件").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("broken"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "有效 PDF" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("deleting all entries persists an empty draft", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("选择 PDF 文件").setInputFiles(sample!);
  await expect(page.getByLabel("词条 9", { exact: true })).toBeVisible();
  for (let i = 0; i < 9; i++)
    await page.getByRole("button", { name: "删除词条 1", exact: true }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: /打开文章/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "当前没有可确认的词条" }),
  ).toBeVisible();
});

test("blocked browser storage backup reports an error without crashing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = function () {
      throw new DOMException("Access denied", "SecurityError");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "导出本地原始备份" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "本地" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
