import { Sparkles } from "lucide-react";
import type { Entry } from "@/lib/types";
import { hasExplanation } from "@/lib/learning";

export function Explanation({
  entry,
  compact = false,
}: {
  entry: Entry;
  compact?: boolean;
}) {
  if (!hasExplanation(entry) || !entry.ai) return null;
  const { data, model, generated_at, provider } = entry.ai;
  return (
    <section
      className={`explanation ${compact ? "compact" : ""}`}
      aria-label={`${entry.term} 的 AI 释义`}
    >
      <div className="explanation-caption">
        <span>
          <Sparkles size={13} /> AI 学习释义
        </span>
        <span>{data.part_of_speech}</span>
      </div>
      <h3>{data.chinese_meaning}</h3>
      <p className="english-definition">{data.english_definition}</p>
      {!compact && (
        <>
          <div className="meaning-grid">
            <div>
              <h4>在这篇文章里</h4>
              <p>{data.context_explanation}</p>
            </div>
            <div>
              <h4>{entry.kind === "phrase" ? "词组与搭配" : "用法提示"}</h4>
              <p>{data.usage_notes}</p>
            </div>
          </div>
          <div className="ai-example">
            <span>补充例句 · AI 生成</span>
            <p>{data.example_en}</p>
            <small>{data.example_zh}</small>
          </div>
          <footer>
            {provider === "agnes" ? "Agnes" : "OpenAI"} · {model} · {new Date(generated_at).toLocaleDateString("zh-CN")} · AI
            解释供学习参考
          </footer>
        </>
      )}
    </section>
  );
}
