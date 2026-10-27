"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Explanation } from "./explanation";
import { cardsFromArticles, fingerprint, type Flashcard } from "@/lib/learning";
import { createRepository } from "@/lib/storage";
import type { Article, Rating } from "@/lib/types";

const ratingLabels: Record<Rating, string> = {
  forgot: "忘记了",
  familiar: "有点印象",
  remembered: "记住了",
};

export function Flashcards({
  articles,
  onChange,
  onLibrary,
}: {
  articles: Article[];
  onChange: () => void;
  onLibrary: () => void;
}) {
  const cards = cardsFromArticles(articles);
  const [filter, setFilter] = useState("all");
  const [session, setSession] = useState<Flashcard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState("");
  const [counts, setCounts] = useState<Record<Rating, number>>({
    forgot: 0,
    familiar: 0,
    remembered: 0,
  });
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const filtered = cards.filter(
    (c) => filter === "all" || c.articleId === filter,
  );
  const history = articles.flatMap((a) =>
    a.entries.flatMap((e) => e.reviews || []),
  );
  function start() {
    setSession(filtered);
    setIndex(0);
    setFlipped(false);
    setError("");
    setCounts({ forgot: 0, familiar: 0, remembered: 0 });
  }
  function rate(rating: Rating) {
    const card = session?.[index];
    if (!card || !flipped || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      createRepository(localStorage).recordReview(
        card.articleId,
        card.entry.id,
        {
          id: crypto.randomUUID(),
          rating,
          reviewed_at: new Date().toISOString(),
          input_signature: fingerprint(card.entry),
        },
      );
      onChange();
      setCounts((v) => ({ ...v, [rating]: v[rating] + 1 }));
      setIndex((i) => i + 1);
      setFlipped(false);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? `反馈未保存：${err.message}`
          : "反馈未保存，请检查本地存储后重试。",
      );
    } finally {
      setPending(false);
      pendingRef.current = false;
    }
  }
  const card = session?.[index];
  return (
    <section className="review-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">FROM READING TO REMEMBERING</span>
          <h1>让记忆，再深一点。</h1>
          <p>先回想，再翻面。用你读过的语境，记住一个表达。</p>
        </div>
        <span className="review-mode">
          <Layers size={15} />
          自由复习
        </span>
      </div>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {!session && (
        <>
          <div className="review-stats">
            <div>
              <strong>{cards.length}</strong>
              <span>可复习闪卡</span>
            </div>
            <div>
              <strong>{history.length}</strong>
              <span>累计学习反馈</span>
            </div>
            <div>
              <strong>{new Set(cards.map((c) => c.articleId)).size}</strong>
              <span>来自阅读的文章</span>
            </div>
          </div>
          {cards.length === 0 ? (
            <div className="review-empty">
              <div className="review-empty-icon">
                <Layers size={30} />
              </div>
              <h2>把第一组词条，变成闪卡。</h2>
              <p>
                确认文章词条并生成 AI 释义后，闪卡会自动出现在这里。
                <br />
                没有释义的词条不会被伪造成完整闪卡。
              </p>
              <Button onClick={onLibrary}>
                前往生词本 <ArrowRight />
              </Button>
            </div>
          ) : (
            <div className="review-start">
              <span className="eyebrow">A SMALL MOMENT, A LASTING MEMORY</span>
              <h2>今天，从这 {filtered.length} 个表达开始。</h2>
              <p>正面回想英文表达，背面查看中文释义、英文解释与原文。</p>
              <label className="review-filter">
                选择文章
                <select
                  aria-label="选择复习文章"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">全部文章</option>
                  {articles
                    .filter((a) => cards.some((c) => c.articleId === a.id))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                </select>
              </label>
              <Button disabled={!filtered.length} onClick={start}>
                开始复习 <ArrowRight />
              </Button>
            </div>
          )}
          <p className="review-footnote">
            反馈保存在当前浏览器。本阶段为自由复习，尚未启用间隔重复调度。
          </p>
        </>
      )}
      {session && index >= session.length && (
        <div className="review-complete">
          <span className="complete-icon">
            <Check size={30} />
          </span>
          <span className="eyebrow">A LITTLE PROGRESS, EVERY DAY</span>
          <h2>这一轮，给记忆留个印象。</h2>
          <p>已完成 {session.length} 张闪卡，反馈已保存。</p>
          <div className="feedback-summary">
            {(Object.keys(ratingLabels) as Rating[]).map((r) => (
              <div key={r} className={r}>
                <strong>{counts[r]}</strong>
                <span>{ratingLabels[r]}</span>
              </div>
            ))}
          </div>
          <Button
            onClick={() => {
              setSession(null);
              setError("");
            }}
          >
            <RotateCcw />
            返回复习首页
          </Button>
        </div>
      )}
      {card && (
        <>
          <div className="review-toolbar">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSession(null);
                setError("");
              }}
            >
              <ArrowLeft />
              结束本轮
            </Button>
            <span>
              {index + 1} / {session!.length}
            </span>
            <span>{card.entry.kind === "word" ? "单词" : "词组"}</span>
          </div>
          <div
            className="review-progress"
            role="progressbar"
            aria-label="本轮复习进度"
            aria-valuemin={0}
            aria-valuemax={session!.length}
            aria-valuenow={index}
          >
            <span style={{ width: `${(index / session!.length) * 100}%` }} />
          </div>
          <div
            className={`flashcard ${flipped ? "flipped" : ""}`}
            key={`${card.articleId}-${card.entry.id}`}
          >
            <div className="flashcard-meta">
              <span>
                {flipped ? "RECALL & CONNECT" : "TAKE A MOMENT TO REMEMBER"}
              </span>
              <span>
                {index + 1 < 10 ? "0" : ""}
                {index + 1}
              </span>
            </div>
            <h2>{card.entry.term}</h2>
            {!flipped ? (
              <div className="card-front">
                <p>这个表达，在原文中是什么意思？</p>
                <Button variant="outline" onClick={() => setFlipped(true)}>
                  <RotateCcw />
                  翻转卡片
                </Button>
                <small>按 Tab 选择按钮，按 Enter 或空格翻面</small>
              </div>
            ) : (
              <div className="card-back">
                <Explanation entry={card.entry} compact />
                <div className="source-example">
                  <span>
                    {card.entry.context_source === "pdf"
                      ? "原文例句 · PDF 提取"
                      : "原文例句 · 用户编辑"}
                  </span>
                  <blockquote>{card.entry.context}</blockquote>
                </div>
                <details className="card-more">
                  <summary>查看语境解释和 AI 补充例句</summary>
                  <p>{card.entry.ai!.data.context_explanation}</p>
                  <div className="ai-example">
                    <span>补充例句 · AI 生成</span>
                    <p>{card.entry.ai!.data.example_en}</p>
                    <small>{card.entry.ai!.data.example_zh}</small>
                  </div>
                </details>
                <button
                  className="back-to-front"
                  onClick={() => setFlipped(false)}
                >
                  返回正面
                </button>
              </div>
            )}
            <footer>
              <Sparkles size={12} />
              <span>
                {card.articleTitle} · 第 {card.entry.page} 页
              </span>
            </footer>
          </div>
          <div className="rating-area">
            {flipped ? (
              <>
                <p>这次记得怎么样？</p>
                <div className="rating-buttons">
                  {(Object.keys(ratingLabels) as Rating[]).map((r, i) => (
                    <button
                      key={r}
                      disabled={pending}
                      className={`rating ${r}`}
                      onClick={() => rate(r)}
                    >
                      <span>{["↺", "≈", "✓"][i]}</span>
                      {ratingLabels[r]}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p>翻面后，记录你的学习反馈。</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
