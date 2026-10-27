import { describe, expect, it } from "vitest";
import { type Article, type Entry } from "./types";
import { createRepository } from "./storage";
import {
  fingerprint,
  hasExplanation,
  applyEntryPatch,
  cardsFromArticles,
  appendReview,
} from "./learning";

const entry: Entry = {
  id: "e1",
  term: "adapt",
  raw_text: "adapt",
  kind: "word",
  page: 1,
  rect: [],
  quads: [],
  context: "People adapt.",
  context_source: "pdf",
  context_status: "sentence",
  warnings: [],
};
const article: Article = {
  id: "a1",
  title: "Article",
  filename: "one.pdf",
  page_count: 1,
  highlight_count: 1,
  entries: [entry],
  warnings: [],
  status: "confirmed",
  updated_at: "2026-10-27T00:00:00.000Z",
};
const data = {
  chinese_meaning: "适应",
  english_definition: "To adjust.",
  part_of_speech: "verb",
  context_explanation: "在这里指人适应变化。",
  usage_notes: "常用搭配是 adapt to something。",
  example_en: "We adapt to change.",
  example_zh: "我们适应变化。",
};
const enriched = () => ({
  ...entry,
  ai: {
    data,
    provider: "openai" as const,
    model: "test-model",
    generated_at: "2026-10-27T00:00:00.000Z",
    input_signature: fingerprint(entry),
  },
});

describe("learning data lifecycle", () => {
  it("treats saved English-only learning notes as missing so they can be regenerated", () => {
    const broken = structuredClone(enriched());
    broken.ai.data.context_explanation = "This explains the article context.";
    broken.ai.data.usage_notes = "This explains the phrase usage.";
    expect(hasExplanation(broken)).toBe(false);
    expect(cardsFromArticles([{ ...article, entries: [broken] }])).toHaveLength(0);
  });
  it("merges asynchronous explanations into latest data and rejects changed/deleted targets", () => {
    let value: string | null = null;
    const repo = createRepository({
      getItem: () => value,
      setItem: (_, v) => {
        value = v;
      },
    });
    const ai = enriched().ai;
    repo.save({ ...article, entries: [enriched()] });
    repo.recordReview("a1", "e1", {
      id: "concurrent-review",
      rating: "familiar",
      reviewed_at: "2026-10-27T02:00:00.000Z",
      input_signature: fingerprint(entry),
    });
    repo.save({ ...repo.list()[0], title: "Concurrent edit" });
    const merged = repo.commitExplanation("a1", "e1", ai);
    expect(merged.title).toBe("Concurrent edit");
    expect(merged.entries[0].reviews?.[0].id).toBe("concurrent-review");
    repo.save({
      ...merged,
      entries: [{ ...merged.entries[0], term: "changed" }],
    });
    expect(() => repo.commitExplanation("a1", "e1", ai)).toThrow();
    expect(repo.list()[0].entries[0].term).toBe("changed");
    repo.remove("a1");
    expect(() => repo.commitExplanation("a1", "e1", ai)).toThrow();
    expect(repo.list()).toEqual([]);
  });
  it("keeps previous v1 entries and round-trips new explanations", () => {
    let value: string | null = JSON.stringify({
      version: 1,
      articles: [article],
    });
    const repo = createRepository({
      getItem: () => value,
      setItem: (_, next) => {
        value = next;
      },
    });
    expect(repo.list()[0].entries[0].term).toBe("adapt");
    repo.save({ ...article, entries: [enriched()] });
    expect(repo.list()[0].entries[0].ai?.data.chinese_meaning).toBe("适应");
  });
  it("invalidates explanations when meaning inputs change but preserves source evidence", () => {
    const result = applyEntryPatch(enriched(), { context: "A new context." });
    expect(result.ai).toBeUndefined();
    expect(result.raw_text).toBe("adapt");
    expect(hasExplanation({ ...enriched(), term: "different" })).toBe(false);
    expect(hasExplanation(applyEntryPatch(enriched(), { page: 2 }))).toBe(true);
  });
  it("creates cards only for confirmed entries with current explanations", () => {
    expect(cardsFromArticles([article])).toHaveLength(0);
    expect(
      cardsFromArticles([
        { ...article, status: "draft", entries: [enriched()] },
      ]),
    ).toHaveLength(0);
    const cards = cardsFromArticles([{ ...article, entries: [enriched()] }]);
    expect(cards).toHaveLength(1);
    expect(cards[0].articleId).toBe("a1");
  });
  it("appends review events idempotently and rejects stale or deleted cards", () => {
    const current = { ...article, entries: [enriched()] };
    const event = {
      id: "r1",
      rating: "forgot" as const,
      reviewed_at: "2026-10-27T01:00:00.000Z",
      input_signature: fingerprint(entry),
    };
    const next = appendReview(current, "e1", event);
    expect(next.entries[0].reviews).toEqual([event]);
    expect(appendReview(next, "e1", event).entries[0].reviews).toHaveLength(1);
    expect(() =>
      appendReview({ ...current, entries: [] }, "e1", event),
    ).toThrow();
    expect(() =>
      appendReview(
        { ...current, entries: [{ ...enriched(), term: "edited" }] },
        "e1",
        event,
      ),
    ).toThrow();
  });
  it("writes feedback against latest saved entry without losing other changes", () => {
    let value: string | null = null;
    const repo = createRepository({
      getItem: () => value,
      setItem: (_, v) => {
        value = v;
      },
    });
    repo.save({ ...article, entries: [enriched()] });
    repo.save({ ...repo.list()[0], title: "Renamed" });
    repo.recordReview("a1", "e1", {
      id: "r2",
      rating: "remembered",
      reviewed_at: "2026-10-27T01:00:00.000Z",
      input_signature: fingerprint(entry),
    });
    expect(repo.list()[0].title).toBe("Renamed");
    expect(repo.list()[0].entries[0].reviews?.[0].rating).toBe("remembered");
  });
});
