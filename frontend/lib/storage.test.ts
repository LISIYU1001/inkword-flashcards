import { describe, expect, it } from "vitest";
import { createRepository, STORAGE_KEY } from "./storage";

function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
const article = {
  id: "test",
  title: "Learning",
  filename: "test.pdf",
  page_count: 1,
  highlight_count: 0,
  entries: [],
  warnings: [],
  status: "draft" as const,
  updated_at: "2026-10-27T00:00:00.000Z",
};

describe("local article repository", () => {
  it("persists edits and intentional deletion of all entries across repository instances", () => {
    const store = memory();
    const repo = createRepository(store);
    repo.save(article);
    repo.save({ ...article, title: "Edited", status: "confirmed" });
    expect(createRepository(store).list()).toEqual([
      { ...article, title: "Edited", status: "confirmed" },
    ]);
    repo.remove("test");
    expect(repo.list()).toEqual([]);
  });
  it("reports corrupt storage without silently replacing it", () => {
    const store = memory();
    store.setItem(STORAGE_KEY, "broken");
    expect(() => createRepository(store).list()).toThrow();
    expect(() => createRepository(store).save(article)).toThrow();
    expect(store.getItem(STORAGE_KEY)).toBe("broken");
  });
  it("rejects an incompatible schema version", () => {
    const store = memory();
    store.setItem(STORAGE_KEY, JSON.stringify({ version: 99, articles: [] }));
    expect(() => createRepository(store).list()).toThrow();
  });
  it("surfaces quota errors instead of claiming a successful save", () => {
    const repo = createRepository({
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(() => repo.save(article)).toThrow();
  });
});
