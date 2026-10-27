import { test, expect, type Page } from "@playwright/test";

// Explicit test fixtures only. No fixture or mock provider exists in the product.
const initialArticle = {
  id: "learning-test",
  title: "自动化测试文章",
  filename: "test.pdf",
  page_count: 1,
  highlight_count: 2,
  status: "confirmed",
  updated_at: "2026-10-27T00:00:00.000Z",
  warnings: [],
  entries: [
    {
      id: "e1",
      term: "adapt",
      raw_text: "adapt",
      kind: "word",
      page: 1,
      rect: [],
      quads: [],
      context: "People adapt to change.",
      context_source: "pdf",
      context_status: "sentence",
      source_context: "People adapt to change.",
      source_page: 1,
      warnings: [],
    },
    {
      id: "e2",
      term: "keep pace with",
      raw_text: "keep pace with",
      kind: "phrase",
      page: 1,
      rect: [],
      quads: [],
      context: "Education must keep pace with technology.",
      context_source: "pdf",
      context_status: "sentence",
      source_context: "Education must keep pace with technology.",
      source_page: 1,
      warnings: [],
    },
  ],
};
function fixtureResult(input: {
  entry_id: string;
  term: string;
  context: string;
}) {
  return {
    entry_id: input.entry_id,
    source_term: input.term,
    source_context: input.context,
    provider: "openai",
    model: "test-fixture-not-live",
    generated_at: "2026-10-27T00:00:00.000Z",
    explanation: {
      chinese_meaning: input.term === "adapt" ? "适应；调整" : "跟上；保持同步",
      english_definition:
        input.term === "adapt"
          ? "To adjust to new conditions."
          : "To progress at the same speed.",
      part_of_speech: input.term === "adapt" ? "verb" : "verb phrase",
      context_explanation: "测试语境解释：在文中表示适应发展变化。",
      usage_notes: "测试用法提示。",
      example_en: "This is an AI example fixture for testing.",
      example_zh: "这是一条自动化测试例句。",
    },
  };
}
async function seed(page: Page, configured = true, provider = "openai") {
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({ json: { configured, provider, model: "test-fixture-not-live" } }),
  );
  await page.goto("/");
  await page.evaluate(
    (article) =>
      localStorage.setItem(
        "inkword.library.v1",
        JSON.stringify({ version: 1, articles: [article] }),
      ),
    initialArticle,
  );
  await page.reload();
  await page.getByRole("button", { name: "打开文章 自动化测试文章" }).click();
}
async function generate(page: Page) {
  await page.getByRole("button", { name: "生成 AI 释义", exact: true }).click();
  await expect(page.getByText("2 / 2 已生成", { exact: true })).toBeVisible();
}

test("missing key does not fabricate explanations or cards", async ({
  page,
}) => {
  await seed(page, false);
  await expect(page.getByText(/尚未配置 API Key/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "生成 AI 释义", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /^闪卡复习/ }).click();
  await expect(
    page.getByRole("heading", { name: "把第一组词条，变成闪卡。" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("inkword.library.v1")!,
      ).articles[0].entries.every((e: { ai?: unknown }) => !e.ai),
    ),
  ).toBe(true);
});

test("batch fixtures become cards; flip and feedback persist after reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page);
  await page.route("**/api/explain", (route) =>
    route.fulfill({ json: fixtureResult(route.request().postDataJSON()) }),
  );
  await generate(page);
  await expect(
    page.getByText("补充例句 · AI 生成", { exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "复习闪卡", exact: true }).click();
  await page.getByRole("button", { name: "开始复习", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "忘记了", exact: false }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "翻转卡片", exact: true }).click();
  await expect(
    page.getByText("People adapt to change.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("适应；调整", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /忘记了/ }).click();
  await expect(
    page.getByRole("heading", { name: "keep pace with", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "翻转卡片", exact: true }).click();
  await page.getByRole("button", { name: /记住了/ }).click();
  await expect(page.getByText("已完成 2 张闪卡，反馈已保存。")).toBeVisible();
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem("inkword.library.v1")!).articles[0],
  );
  expect(stored.entries[0].reviews[0].rating).toBe("forgot");
  expect(stored.entries[1].reviews[0].rating).toBe("remembered");
  expect(stored.entries[0].context).toBe(initialArticle.entries[0].context);
  await page.reload();
  await page.getByRole("button", { name: /^闪卡复习/ }).click();
  await expect(
    page.getByText("累计学习反馈", { exact: true }).locator(".."),
  ).toContainText("2");
  expect(errors).toEqual([]);
});

test("partial results persist and retry only missing entries", async ({
  page,
}) => {
  await seed(page);
  const calls: string[] = [];
  let fail = true;
  await page.route("**/api/explain", (route) => {
    const input = route.request().postDataJSON();
    calls.push(input.entry_id);
    return input.entry_id === "e2" && fail
      ? route.fulfill({
          status: 502,
          json: { detail: { code: "AI_TIMEOUT", message: "测试超时" } },
        })
      : route.fulfill({ json: fixtureResult(input) });
  });
  await page.getByRole("button", { name: "生成 AI 释义", exact: true }).click();
  await expect(page.getByText("测试超时", { exact: true })).toBeVisible();
  await expect(page.getByText("1 / 2 已生成", { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "补全缺失释义", exact: true }).click();
  await expect(page.getByText("2 / 2 已生成", { exact: true })).toBeVisible();
  expect(calls).toEqual(["e1", "e2", "e2"]);
  await page.getByLabel("词条 1", { exact: true }).fill("different");
  await expect(page.getByText("1 / 2 已生成", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "补全缺失释义", exact: true }),
  ).toBeDisabled();
});

test("stop prevents additional requests and generation locks edits/navigation", async ({
  page,
}) => {
  await seed(page);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  await page.route("**/api/explain", async (route) => {
    calls++;
    await gate;
    await route.fulfill({
      json: fixtureResult(route.request().postDataJSON()),
    });
  });
  await page.getByRole("button", { name: "生成 AI 释义", exact: true }).click();
  await expect(page.getByLabel("词条 1", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "阅读空间", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "让每个词，回到语境里。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "停止后续生成", exact: true }).click();
  release();
  await expect(page.getByText("1 / 2 已生成", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "补全缺失释义", exact: true }),
  ).toBeEnabled();
  expect(calls).toBe(1);
});

test("failed local save stops batch and retains current JSON export", async ({
  page,
}) => {
  await seed(page);
  let calls = 0;
  await page.route("**/api/explain", (route) => {
    calls++;
    return route.fulfill({
      json: fixtureResult(route.request().postDataJSON()),
    });
  });
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "生成 AI 释义", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "本地保存失败" }),
  ).toBeVisible();
  expect(calls).toBe(1);
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  expect((await wait).suggestedFilename()).toBe("inkword-backup.json");
});

test("feedback save failure does not advance the card; mobile fits", async ({
  page,
}) => {
  await seed(page);
  await page.route("**/api/explain", (route) =>
    route.fulfill({ json: fixtureResult(route.request().postDataJSON()) }),
  );
  await generate(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "复习闪卡", exact: true }).click();
  await page.getByRole("button", { name: "开始复习", exact: true }).click();
  await page.getByRole("button", { name: "翻转卡片", exact: true }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: /有点印象/ }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "反馈未保存" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "adapt", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("deleting the article while AI is pending cannot resurrect it", async ({
  page,
}) => {
  await seed(page);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  await page.route("**/api/explain", async (route) => {
    calls++;
    await gate;
    await route.fulfill({
      json: fixtureResult(route.request().postDataJSON()),
    });
  });
  await page.getByRole("button", { name: "生成 AI 释义", exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  await page.evaluate(() =>
    localStorage.setItem(
      "inkword.library.v1",
      JSON.stringify({ version: 1, articles: [] }),
    ),
  );
  release();
  await expect(
    page.getByRole("alert").filter({ hasText: "其他页面" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("inkword.library.v1")!).articles,
    ),
  ).toEqual([]);
  await expect(
    page.getByRole("button", { name: "确认并保存", exact: true }),
  ).toHaveCount(0);
  expect(calls).toBe(1);
});


test("Agnes disclosure, generated results and provider survive reload", async ({ page }) => {
  await seed(page, true, "agnes");
  await expect(page.getByText(/点击生成会将已确认词条与上下文发送给Agnes/)).toBeVisible();
  await page.route("**/api/explain", (route) => route.fulfill({ json: {
    ...fixtureResult(route.request().postDataJSON()), provider: "agnes",
  } }));
  await generate(page);
  await page.reload();
  await page.getByRole("button", { name: "打开文章 自动化测试文章" }).click();
  await expect(page.getByText("2 / 2 已生成", { exact: true })).toBeVisible();
  const providers = await page.evaluate(() => JSON.parse(localStorage.getItem("inkword.library.v1")!).articles[0].entries.map((e: { ai: { provider: string } }) => e.ai.provider));
  expect(providers).toEqual(["agnes", "agnes"]);
});
