import type { Article, Entry, ReviewEvent } from "./types";

/** Input identity, not a cryptographic hash. Exact content avoids silent collisions. */
export function fingerprint(
  entry: Pick<Entry, "term" | "kind" | "context">,
): string {
  return JSON.stringify([entry.term.trim(), entry.kind, entry.context.trim()]);
}
export function hasExplanation(entry: Entry): boolean {
  if (!entry.ai || entry.ai.input_signature !== fingerprint(entry)) return false;
  const { context_explanation, usage_notes } = entry.ai.data;
  return /[\u3400-\u9fff]/u.test(context_explanation) && /[\u3400-\u9fff]/u.test(usage_notes);
}
export function applyEntryPatch(entry: Entry, patch: Partial<Entry>): Entry {
  const next = { ...entry, ...patch };
  if (fingerprint(entry) !== fingerprint(next)) delete next.ai;
  return next;
}
export type Flashcard = {
  articleId: string;
  articleTitle: string;
  entry: Entry;
};
export function cardsFromArticles(articles: Article[]): Flashcard[] {
  return articles
    .filter((a) => a.status === "confirmed")
    .flatMap((a) =>
      a.entries
        .filter(hasExplanation)
        .map((entry) => ({ articleId: a.id, articleTitle: a.title, entry })),
    );
}
export function appendReview(
  article: Article,
  entryId: string,
  event: ReviewEvent,
): Article {
  const entry = article.entries.find((e) => e.id === entryId);
  if (
    article.status !== "confirmed" ||
    !entry ||
    !hasExplanation(entry) ||
    fingerprint(entry) !== event.input_signature
  )
    throw new Error("词条已修改或删除，请重新开始复习。");
  if (entry.reviews?.some((r) => r.id === event.id)) return article;
  return {
    ...article,
    updated_at: event.reviewed_at,
    entries: article.entries.map((e) =>
      e.id === entryId ? { ...e, reviews: [...(e.reviews || []), event] } : e,
    ),
  };
}
