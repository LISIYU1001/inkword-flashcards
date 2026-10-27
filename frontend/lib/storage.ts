import { z } from "zod";
import {
  articleSchema,
  type Article,
  type Entry,
  type ReviewEvent,
} from "./types";
import { appendReview, fingerprint } from "./learning";

export class ArticleChangedError extends Error {}

export const STORAGE_KEY = "inkword.library.v1";
const envelope = z.object({
  version: z.literal(1),
  articles: z.array(articleSchema),
});
type StoragePort = Pick<Storage, "getItem" | "setItem">;

/** Replace this adapter with Supabase without changing parser evidence or UI models. */
export function createRepository(storage: StoragePort) {
  function list(): Article[] {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = envelope.safeParse(JSON.parse(raw));
    if (!parsed.success)
      throw new Error(
        "本地记录格式不兼容或已损坏。请先导出备份，不会覆盖现有数据。",
      );
    return parsed.data.articles;
  }
  function write(articles: Article[]) {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(envelope.parse({ version: 1, articles })),
    );
  }
  return {
    list,
    save(article: Article) {
      write([article, ...list().filter((a) => a.id !== article.id)]);
    },
    remove(id: string) {
      write(list().filter((a) => a.id !== id));
    },
    commitExplanation(
      articleId: string,
      entryId: string,
      ai: NonNullable<Entry["ai"]>,
    ): Article {
      const articles = list();
      const article = articles.find((a) => a.id === articleId);
      const entry = article?.entries.find((e) => e.id === entryId);
      if (
        !article ||
        article.status !== "confirmed" ||
        !entry ||
        fingerprint(entry) !== ai.input_signature
      ) {
        throw new ArticleChangedError(
          "文章或词条已在其他页面修改或删除，已丢弃过期 AI 响应。",
        );
      }
      const updated = {
        ...article,
        updated_at: new Date().toISOString(),
        entries: article.entries.map((e) =>
          e.id === entryId ? { ...e, ai } : e,
        ),
      };
      write(articles.map((a) => (a.id === articleId ? updated : a)));
      return updated;
    },
    recordReview(articleId: string, entryId: string, event: ReviewEvent) {
      const articles = list();
      const article = articles.find((a) => a.id === articleId);
      if (!article) throw new Error("文章已删除，无法保存反馈。");
      const updated = appendReview(article, entryId, event);
      write(articles.map((a) => (a.id === articleId ? updated : a)));
    },
  };
}
