"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  FileText,
  Highlighter,
  Home,
  Layers,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Article,
  type Entry,
  parseSchema,
  explainResponseSchema,
} from "@/lib/types";
import {
  createRepository,
  STORAGE_KEY,
  ArticleChangedError,
} from "@/lib/storage";
import {
  applyEntryPatch,
  cardsFromArticles,
  fingerprint,
  hasExplanation,
} from "@/lib/learning";
import { Explanation } from "./explanation";
import { Flashcards } from "./flashcards";

type View = "home" | "library" | "editor" | "review";

function download(content: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Workspace() {
  const [view, setView] = useState<View>("home");
  const [articles, setArticles] = useState<Article[]>([]);
  const [active, setActive] = useState<Article | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [sourceId, setSourceId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [aiStatus, setAiStatus] = useState<{
    configured: boolean;
    model: string | null;
    unavailable?: boolean;
    provider?: "openai" | "agnes";
    error?: string;
  } | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiProgress, setAiProgress] = useState({ done: 0, total: 0 });
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  const stopAi = useRef(false);
  const aiRunLock = useRef(false);
  const locked = busy || aiRunning;
  const providerName = aiStatus?.provider === "agnes" ? "Agnes" : aiStatus?.provider === "openai" ? "OpenAI" : "已配置的 AI 服务";
  const cardCount = cardsFromArticles(articles).length;

  async function refreshAiStatus() {
    try {
      const response = await fetch("/api/ai/status", { cache: "no-store" });
      const status = await response.json();
      setAiStatus({
        configured: status.configured === true,
        model: typeof status.model === "string" ? status.model : null,
        unavailable: !response.ok,
        provider: status.provider === "agnes" ? "agnes" : "openai",
        error: typeof status.error === "string" ? status.error : undefined,
      });
    } catch {
      setAiStatus({ configured: false, model: null, unavailable: true });
    }
  }

  useEffect(() => {
    try {
      setArticles(createRepository(localStorage).list());
    } catch {
      setError("本地记录读取失败。你可以导出原始备份；当前数据不会被覆盖。");
    }
    setReady(true);
    void refreshAiStatus();
  }, []);
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );
  useEffect(() => {
    function guard(event: BeforeUnloadEvent) {
      if (dirty || aiRunning) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, aiRunning]);

  const terms = articles.reduce((n, a) => n + a.entries.length, 0);
  function leave() {
    return !dirty || window.confirm("当前修改尚未保存，确定离开吗？");
  }
  function navigate(next: View) {
    if (locked || !leave()) return;
    setView(next);
    setDirty(false);
    setQuery("");
    setNotice("");
  }
  function open(article: Article) {
    if (locked || !leave()) return;
    setActive(structuredClone(article));
    setDirty(false);
    setView("editor");
    setQuery("");
    setNotice("");
    setAiErrors({});
    setAiProgress({ done: 0, total: 0 });
  }
  function persist(article: Article) {
    createRepository(localStorage).save(article);
    setArticles(createRepository(localStorage).list());
  }
  async function upload(file?: File) {
    if (!file || locked || !leave()) return;
    setError("");
    setNotice("");
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("请选择 PDF 文件。");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("文件超过 20 MB，请拆分后重试。");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/parse", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(70000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.detail?.message === "string"
            ? data.detail.message
            : "文件解析失败，请检查 PDF 后重试。",
        );
      const result = parseSchema.parse(data);
      const article: Article = {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.pdf$/i, ""),
        filename: file.name,
        page_count: result.page_count,
        highlight_count: result.highlight_count,
        entries: result.entries.map((e) => ({
          ...e,
          source_context: e.context,
          source_page: e.page,
        })),
        warnings: result.warnings,
        status: "draft",
        updated_at: new Date().toISOString(),
      };
      setActive(article);
      setView("editor");
      setQuery("");
      setAiErrors({});
      setPdfUrl(URL.createObjectURL(file));
      setSourceId(article.id);
      try {
        persist(article);
        setDirty(false);
      } catch {
        setDirty(true);
        setError(
          "解析成功，但本地保存失败。请导出当前结果备份，避免关闭页面后丢失。",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "无法连接解析服务，请稍后重试。",
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function update(id: string, patch: Partial<Entry>) {
    if (!active || locked) return;
    setActive({
      ...active,
      status: "draft",
      entries: active.entries.map((e) =>
        e.id === id ? applyEntryPatch(e, patch) : e,
      ),
    });
    setDirty(true);
    setNotice("");
    setAiErrors((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }
  function addEntry() {
    if (!active || locked) return;
    const entry: Entry = {
      id: crypto.randomUUID(),
      term: "",
      raw_text: "",
      kind: "word",
      page: 1,
      rect: [],
      quads: [],
      context: "",
      source_context: "",
      context_source: "manual",
      context_status: "review",
      warnings: [],
    };
    setActive({
      ...active,
      status: "draft",
      entries: [...active.entries, entry],
    });
    setDirty(true);
    setQuery("");
  }
  function save(confirm: boolean) {
    if (!active || locked) return;
    if (
      active.entries.some(
        (e) =>
          !e.term.trim() ||
          !Number.isInteger(e.page) ||
          e.page < 1 ||
          e.page > active.page_count,
      )
    ) {
      setError("请填写每个词条，并确保页码在文章页数范围内。");
      return;
    }
    if (confirm && !active.entries.length) {
      setError("请至少保留一个词条后再确认。空列表可以保存为草稿。");
      return;
    }
    const article = {
      ...active,
      entries: active.entries.map((e) => ({ ...e, term: e.term.trim() })),
      status: confirm ? ("confirmed" as const) : ("draft" as const),
      updated_at: new Date().toISOString(),
    };
    try {
      persist(article);
      setActive(article);
      setDirty(false);
      setError("");
      setNotice(
        confirm
          ? "已确认并保存到生词本，可以生成 AI 释义并自动建立闪卡。"
          : "草稿已保存到当前浏览器。",
      );
    } catch {
      setError("本地存储不可用或空间不足，修改尚未保存。请导出 JSON 备份。");
    }
  }
  function exportData() {
    download(
      JSON.stringify(
        {
          version: 1,
          articles: active && view === "editor" ? [active] : articles,
        },
        null,
        2,
      ),
      "inkword-backup.json",
    );
  }
  function exportRawBackup() {
    try {
      download(
        localStorage.getItem(STORAGE_KEY) || "{}",
        "inkword-raw-backup.json",
      );
    } catch {
      setError(
        "浏览器禁止读取本地存储，无法导出本地原始备份。当前已解析结果仍可使用「导出 JSON」保存。",
      );
    }
  }
  async function generateExplanations() {
    if (!active || locked || aiRunLock.current) return;
    if (dirty || active.status !== "confirmed") {
      setError("请先确认并保存词条，再生成释义。");
      return;
    }
    const pendingEntries = active.entries.filter((e) => !hasExplanation(e));
    if (!pendingEntries.length) return;
    aiRunLock.current = true;
    setAiRunning(true);
    stopAi.current = false;
    setAiErrors({});
    setNotice("");
    setError("");
    setAiProgress({ done: 0, total: pendingEntries.length });
    let current = structuredClone(active);
    let success = 0;
    let processed = 0;
    let saveFailed = false;
    try {
      for (const entry of pendingEntries) {
        if (stopAi.current) break;
        try {
          if (!entry.context.trim())
            throw new Error("请填写原文上下文，重新确认后再生成。");
          if (
            entry.term.trim().length > 200 ||
            entry.context.trim().length > 6000
          )
            throw new Error(
              "词条最多 200 字符，上下文最多 6000 字符，请精简后重新确认。",
            );
          const response = await fetch("/api/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entry_id: entry.id,
              term: entry.term.trim(),
              kind: entry.kind,
              context: entry.context.trim(),
            }),
            signal: AbortSignal.timeout(55000),
          });
          const payload = await response.json();
          if (!response.ok) {
            if (
              [
                "AI_NOT_CONFIGURED",
                "AI_AUTH_ERROR",
                "AI_RATE_LIMIT",
                "BACKEND_UNAVAILABLE",
              ].includes(payload.detail?.code)
            )
              stopAi.current = true;
            throw new Error(
              typeof payload.detail?.message === "string"
                ? payload.detail.message
                : "解释生成失败，请检查词条后重试。",
            );
          }
          const result = explainResponseSchema.parse(payload);
          if (
            result.entry_id !== entry.id ||
            result.source_term !== entry.term.trim() ||
            result.source_context !== entry.context.trim()
          )
            throw new Error("释义与当前词条不匹配，未写入。");
          current = {
            ...current,
            updated_at: new Date().toISOString(),
            entries: current.entries.map((e) =>
              e.id === entry.id
                ? {
                    ...e,
                    ai: {
                      data: result.explanation,
                      model: result.model,
                      provider: result.provider,
                      generated_at: result.generated_at,
                      input_signature: fingerprint(entry),
                    },
                  }
                : e,
            ),
          };
          setActive(current);
          try {
            const repo = createRepository(localStorage);
            current = repo.commitExplanation(
              current.id,
              entry.id,
              current.entries.find((e) => e.id === entry.id)!.ai!,
            );
            setActive(current);
            setArticles(repo.list());
            setDirty(false);
          } catch (err) {
            saveFailed = true;
            if (err instanceof ArticleChangedError) {
              const latest = createRepository(localStorage).list();
              setArticles(latest);
              setActive(latest.find((a) => a.id === current.id) || null);
              if (!latest.some((a) => a.id === current.id)) setView("library");
              setDirty(false);
              setError(`${err.message} 已停止生成，请检查最新词条后重试。`);
            } else {
              setDirty(true);
              setError(
                "AI 解释已返回，但本地保存失败。已停止后续请求，请立即导出 JSON 备份。",
              );
            }
            break;
          }
          success++;
        } catch (err) {
          setAiErrors((previous) => ({
            ...previous,
            [entry.id]:
              err instanceof Error ? err.message : "此词条生成失败，请重试。",
          }));
        }
        processed++;
        setAiProgress({ done: processed, total: pendingEntries.length });
      }
      if (!saveFailed)
        setNotice(
          `${stopAi.current ? "已停止后续生成。" : ""}本次已生成并保存 ${success} 条释义，成功词条已自动成为闪卡。${processed - success > 0 ? "失败词条可使用「补全缺失释义」重试。" : ""}`,
        );
    } finally {
      setAiRunning(false);
      aiRunLock.current = false;
    }
  }
  const filtered = articles.filter((a) =>
    `${a.title} ${a.entries.map((e) => e.term).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate("home")}
          aria-label="Inkword 首页"
        >
          <span className="brand-mark">
            <Highlighter size={23} />
          </span>
          <span>
            inkword<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="workspace-label">
          你的阅读工作台 <span>LOCAL</span>
        </div>
        <nav aria-label="主导航">
          <button
            className={view === "home" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("home")}
          >
            <Home size={18} />
            阅读空间
          </button>
          <button
            className={view === "library" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("library")}
          >
            <BookOpen size={18} />
            我的生词本 <span className="nav-count">{terms}</span>
          </button>
          <button
            className={view === "review" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("review")}
          >
            <Layers size={18} />
            闪卡复习 <span className="nav-count">{cardCount}</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="tiny-label">ONE HIGHLIGHT AT A TIME</span>
          <p>
            读过的好表达，
            <br />
            值得真正记住。
          </p>
          <div className="scribble">Read. Collect. Grow.</div>
        </div>
        <div className="local-state">
          <span className="status-dot" />
          <div>
            本地学习空间<small>数据保存在当前浏览器</small>
          </div>
          <ShieldCheck size={16} />
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            我的工作台 <ChevronRight size={14} />
            <span>
              {view === "home"
                ? "阅读空间"
                : view === "library"
                  ? "生词本"
                  : view === "review"
                    ? "闪卡复习"
                    : "确认词条"}
            </span>
          </div>
          <span className="phase">
            <span />
            阅读 · 理解 · 记住
          </span>
        </header>
        <div className="content">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            aria-label="选择 PDF 文件"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          {error && (
            <div className="alert error" role="alert">
              <div>{error}</div>
              <div className="alert-actions">
                <button onClick={exportRawBackup}>导出本地原始备份</button>
                <button aria-label="关闭错误提示" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}

          {view === "home" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <span className="eyebrow">
                    <span />
                    让每一次阅读，都有收获
                  </span>
                  <h1>
                    把划过的重点，
                    <br />
                    变成自己的<span className="highlight-title">语言。</span>
                  </h1>
                  <p>
                    导入你在 WPS 中标注的英文 PDF，
                    <br />
                    让生词与原文语境一起留下来。
                  </p>
                  <div className="hero-foot">
                    <span>01 提取高亮</span>
                    <ArrowRight size={13} />
                    <span>02 确认词条</span>
                    <ArrowRight size={13} />
                    <span className="muted">03 积累与复习</span>
                  </div>
                </div>
                <div className="paper-scene" aria-label="阅读摘录示意">
                  <div className="paper-back" />
                  <div className="paper">
                    <div className="paper-meta">
                      THE READING NOTES <span>示意</span>
                    </div>
                    <h3>
                      A little learning,
                      <br />
                      every day.
                    </h3>
                    <div className="paper-rule" />
                    <p>
                      The beautiful thing about
                      <br />
                      learning is that it stays
                      <br />
                      with you. <mark>Keep growing.</mark>
                    </p>
                    <div className="paper-lines">
                      <i />
                      <i />
                      <i />
                    </div>
                    <span className="paper-footer">
                      Make room for new words.
                    </span>
                  </div>
                  <div className="word-slip">
                    <span className="slip-icon">
                      <Highlighter size={17} />
                    </span>
                    <div>
                      <strong>keep growing</strong>
                      <small>让表达在语境中生根</small>
                    </div>
                    <span className="slip-check">
                      <Check size={14} />
                    </span>
                  </div>
                </div>
              </section>
              <section
                className={`upload-area ${drag ? "dragging" : ""} ${busy ? "uploading" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  upload(e.dataTransfer.files[0]);
                }}
              >
                <div className="upload-symbol">
                  {busy ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <UploadCloud />
                  )}
                </div>
                <div className="upload-copy">
                  <h2>{busy ? "正在读取高亮与原文…" : "从一篇好文章开始"}</h2>
                  <p>
                    {busy
                      ? "保留原文证据，不猜测无法识别的内容"
                      : "将 PDF 拖到这里，或选择文件上传"}
                  </p>
                  <small>
                    WPS 高亮批注 · 可选中文字的 PDF · 最大 20 MB / 100 页
                  </small>
                </div>
                <Button
                  disabled={busy || !ready}
                  onClick={() => fileRef.current?.click()}
                >
                  <Plus />
                  {busy ? "正在解析" : "上传 PDF"}
                </Button>
              </section>
              <div className="privacy-line">
                <ShieldCheck size={14} />
                PDF 在本机解析；生成释义时，仅发送所选词条和上下文至{providerName}。
              </div>
              <section className="recent-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      最近阅读 <span>{articles.length}</span>
                    </h2>
                    <p>每一篇读过的文章，都是积累的一部分。</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("library")}
                  >
                    查看全部 <ArrowRight />
                  </Button>
                </div>
                {!ready ? (
                  <p className="empty-copy">正在读取本地记录…</p>
                ) : articles.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <BookOpen size={24} />
                    </div>
                    <h3>你的阅读收藏，从这里开始</h3>
                    <p>上传第一篇文章，整理那些让你停下来的词句。</p>
                    <span>不预置示例词条，每条记录都来自你的阅读。</span>
                  </div>
                ) : (
                  <div className="article-grid">
                    {articles.slice(0, 3).map((a) => (
                      <ArticleCard
                        key={a.id}
                        article={a}
                        onOpen={() => open(a)}
                      />
                    ))}
                  </div>
                )}
              </section>
              <footer className="page-footer">
                <span>少一点遗忘，多一点积累。</span>
                <span>INKWORD · YOUR WORDS, IN CONTEXT</span>
              </footer>
            </>
          )}

          {view === "library" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR PERSONAL COLLECTION</span>
                  <h1>
                    我的生词本<span className="accent-dot">.</span>
                  </h1>
                  <p>
                    {articles.length} 篇文章，{terms} 个来自阅读的词条，
                    {cardCount} 张可复习闪卡。
                  </p>
                </div>
                <div className="heading-actions">
                  <Button variant="outline" onClick={() => navigate("review")}>
                    <Layers />
                    开始复习
                  </Button>
                  <Button variant="outline" onClick={exportData}>
                    <ArrowDownToLine />
                    导出备份
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Plus />
                    上传 PDF
                  </Button>
                </div>
              </div>
              <div className="search-bar">
                <Search size={17} />
                <Input
                  aria-label="搜索文章或词条"
                  placeholder="搜索文章名称或英文词条…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span>{filtered.length} 篇文章</span>
              </div>
              {filtered.length ? (
                <div className="article-grid library-grid">
                  {filtered.map((a) => (
                    <ArticleCard
                      key={a.id}
                      article={a}
                      onOpen={() => open(a)}
                      onDelete={() => {
                        if (!window.confirm(`删除「${a.title}」及其词条？`))
                          return;
                        try {
                          const repo = createRepository(localStorage);
                          repo.remove(a.id);
                          setArticles(repo.list());
                        } catch {
                          setError("删除失败，本地数据没有更新。");
                        }
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <BookOpen size={28} />
                  <h3>{query ? "没有找到匹配的文章" : "还没有收藏的文章"}</h3>
                  <p>上传一份带有高亮批注的 PDF，开始积累。</p>
                </div>
              )}
            </>
          )}

          {view === "review" && (
            <Flashcards
              articles={articles}
              onChange={() =>
                setArticles(createRepository(localStorage).list())
              }
              onLibrary={() => navigate("library")}
            />
          )}

          {view === "editor" && active && (
            <>
              <div className="page-heading editor-heading">
                <div>
                  <span className="eyebrow">CAPTURE → CONFIRM → KEEP</span>
                  <h1>让每个词，回到语境里。</h1>
                  <p>检查提取结果，保留真正想记住的表达。</p>
                </div>
                <Button variant="outline" onClick={exportData}>
                  <ArrowDownToLine />
                  导出 JSON
                </Button>
              </div>
              <div className="document-bar">
                <div className="document-icon">
                  <FileText />
                </div>
                <div className="document-info">
                  <h2>{active.title}</h2>
                  <p>
                    {active.page_count} 页 <span>·</span> 检测到{" "}
                    {active.highlight_count} 处高亮 <span>·</span> 当前{" "}
                    {active.entries.length} 个词条
                  </p>
                </div>
                <span
                  className={`status-badge ${active.status === "confirmed" && !dirty ? "confirmed" : ""}`}
                >
                  {dirty
                    ? "有未保存修改"
                    : active.status === "confirmed"
                      ? "已确认"
                      : "待确认"}
                </span>
                {pdfUrl && sourceId === active.id && (
                  <a
                    className="source-link"
                    href={pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看原 PDF ↗
                  </a>
                )}
              </div>
              {active.warnings.map((w, i) => (
                <div key={i} className="alert warning">
                  {w.page ? `第 ${w.page} 页：` : ""}
                  {w.message}
                </div>
              ))}
              <section className="ai-panel" aria-label="AI 释义生成">
                <div className="ai-panel-title">
                  <span className="ai-panel-icon">
                    <Sparkles size={19} />
                  </span>
                  <div>
                    <h2>让语境，解释这个词。</h2>
                    <p>中文释义 · 英文解释 · 语境解读 · 补充例句</p>
                  </div>
                  <span className="status-badge confirmed">
                    {active.entries.filter(hasExplanation).length} /{" "}
                    {active.entries.length} 已生成
                  </span>
                </div>
                <p className="ai-disclosure">
                  点击生成会将已确认词条与上下文发送给{providerName}，可能产生 API
                  费用；不发送 PDF 文件。每条成功结果会立即保存到本地。
                </p>
                {aiStatus?.configured === false && (
                  <div className="ai-setup" role="status">
                    {aiStatus.unavailable ? (
                      "无法连接 AI 后端，请检查本机解析服务。"
                    ) : aiStatus.error ? (
                      aiStatus.error
                    ) : (
                      <>
                        尚未配置 API Key。请在本机 <code>backend/.env</code>{" "}
                        设置 <code>{aiStatus.provider === "agnes" ? "AGNES_API_KEY" : "OPENAI_API_KEY"}</code>{" "}
                        并重启后端；无需把密钥发到聊天或网页。
                      </>
                    )}
                  </div>
                )}
                {!active.entries.every((e) => e.context.trim()) && (
                  <p className="entry-warning">
                    部分词条缺少原文上下文，请先补充，避免脱离语境解释。
                  </p>
                )}
                <div className="ai-panel-actions">
                  <small>
                    {aiStatus?.configured
                      ? `${aiStatus.model} · 服务端已配置`
                      : aiStatus
                        ? "配置后点击刷新"
                        : "正在检查后端配置…"}
                  </small>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={aiRunning}
                    onClick={refreshAiStatus}
                  >
                    刷新配置
                  </Button>
                  {aiRunning ? (
                    <>
                      <span role="status">
                        正在生成 {aiProgress.done} / {aiProgress.total}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          stopAi.current = true;
                          setNotice("将在当前词条处理完成后停止。");
                        }}
                      >
                        停止后续生成
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      disabled={
                        !aiStatus?.configured ||
                        dirty ||
                        active.status !== "confirmed" ||
                        active.entries.every(hasExplanation)
                      }
                      onClick={generateExplanations}
                    >
                      <Sparkles />
                      {active.entries.some(hasExplanation)
                        ? "补全缺失释义"
                        : "生成 AI 释义"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      locked ||
                      dirty ||
                      active.status !== "confirmed" ||
                      !active.entries.some(hasExplanation)
                    }
                    onClick={() => navigate("review")}
                  >
                    <Layers />
                    复习闪卡
                  </Button>
                </div>
                {(dirty || active.status !== "confirmed") && (
                  <p className="ai-reconfirm">
                    请先点击底部「确认并保存」，再生成释义。
                  </p>
                )}
              </section>
              <div className="editor-tools">
                <span>
                  <span className="status-dot" />
                  提取结果可编辑 · 保留原始证据
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  onClick={addEntry}
                >
                  <Plus />
                  手动添加词条
                </Button>
              </div>
              <fieldset className="entry-list" disabled={locked}>
                {active.entries.map((entry, index) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    index={index}
                    pages={active.page_count}
                    aiError={aiErrors[entry.id]}
                    onChange={(patch) => update(entry.id, patch)}
                    onDelete={() => {
                      setActive({
                        ...active,
                        status: "draft",
                        entries: active.entries.filter(
                          (e) => e.id !== entry.id,
                        ),
                      });
                      setDirty(true);
                      setNotice("");
                    }}
                  />
                ))}
                {!active.entries.length && (
                  <div className="empty-state">
                    <Highlighter size={26} />
                    <h3>当前没有可确认的词条</h3>
                    <p>查看上方诊断，或手动添加词条。我们不会猜测标注内容。</p>
                    <Button variant="outline" onClick={addEntry}>
                      <Plus />
                      手动添加
                    </Button>
                  </div>
                )}
              </fieldset>
              <div className="save-bar">
                <div>
                  <strong>{active.entries.length} 个词条</strong>
                  <small>
                    {dirty ? "修改尚未保存" : "已保存到当前浏览器"} · 原 PDF
                    不保存在生词本中
                  </small>
                </div>
                <div>
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() => save(false)}
                  >
                    保存草稿
                  </Button>
                  <Button
                    onClick={() => save(true)}
                    disabled={locked || !active.entries.length}
                  >
                    <Check />
                    确认并保存
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ArticleCard({
  article,
  onOpen,
  onDelete,
}: {
  article: Article;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className="article-card">
      <div className="article-top">
        <div className="article-icon">
          <FileText size={20} />
        </div>
        <span
          className={`status-badge ${article.status === "confirmed" ? "confirmed" : ""}`}
        >
          {article.status === "confirmed" ? "已确认" : "待确认"}
        </span>
      </div>
      <button className="article-title" onClick={onOpen}>
        {article.title}
      </button>
      <div className="article-terms">
        {article.entries.slice(0, 3).map((e) => (
          <span key={e.id}>{e.term || "未命名词条"}</span>
        ))}
      </div>
      <div className="article-bottom">
        <span>
          {article.entries.length} 个词条 ·{" "}
          {new Date(article.updated_at).toLocaleDateString("zh-CN")}
        </span>
        <div>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`删除文章 ${article.title}`}
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`打开文章 ${article.title}`}
            onClick={onOpen}
          >
            <ArrowRight />
          </Button>
        </div>
      </div>
    </article>
  );
}

function EntryCard({
  entry,
  index,
  pages,
  onChange,
  onDelete,
  aiError,
}: {
  entry: Entry;
  index: number;
  pages: number;
  onChange: (p: Partial<Entry>) => void;
  onDelete: () => void;
  aiError?: string;
}) {
  return (
    <article className="entry-card">
      <div className="entry-number">{String(index + 1).padStart(2, "0")}</div>
      <div className="entry-body">
        <div className="entry-top">
          <Input
            className="term-input"
            aria-label={`词条 ${index + 1}`}
            placeholder="输入英文单词或词组"
            value={entry.term}
            onChange={(e) =>
              onChange({
                term: e.target.value,
                kind:
                  e.target.value.trim().split(/\s+/).length > 1
                    ? "phrase"
                    : "word",
              })
            }
          />
          <span className="kind-badge">
            {entry.kind === "word" ? "单词" : "词组"}
          </span>
          <label className="page-input">
            第{" "}
            <input
              aria-label={`词条 ${index + 1} 页码`}
              type="number"
              min={1}
              max={pages}
              value={entry.page}
              onChange={(e) => onChange({ page: Number(e.target.value) })}
            />{" "}
            页
          </label>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`删除词条 ${index + 1}`}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
        <label className="context-label" htmlFor={`context-${entry.id}`}>
          <span>
            {entry.context_source === "pdf"
              ? "原文语境 · PDF 提取"
              : "原文语境 · 用户填写或编辑"}
          </span>
          {entry.context_status !== "sentence" && (
            <span className="review-tag">请核对上下文</span>
          )}
        </label>
        <textarea
          id={`context-${entry.id}`}
          value={entry.context}
          placeholder="填写原文例句（不自动生成）"
          onChange={(e) =>
            onChange({
              context: e.target.value,
              context_source: "manual",
              context_status: "review",
            })
          }
        />
        {entry.warnings.map((w, i) => (
          <p className="entry-warning" key={i}>
            {w}
          </p>
        ))}
        <details className="evidence">
          <summary>查看原始提取与位置</summary>
          <dl>
            <dt>高亮原文</dt>
            <dd>{entry.raw_text || "手动添加，无 PDF 高亮证据"}</dd>
            <dt>原始上下文</dt>
            <dd>{entry.source_context || "无"}</dd>
            <dt>原始页码</dt>
            <dd>{entry.source_page ?? (entry.raw_text ? "未记录" : "无")}</dd>
            <dt>位置（PDF 点）</dt>
            <dd>
              {entry.rect.length
                ? entry.rect.map((n) => n.toFixed(1)).join(", ")
                : "无"}{" "}
              · {entry.quads.length} 个高亮区域
            </dd>
          </dl>
        </details>
        {aiError && (
          <p className="ai-entry-error" role="alert">
            {aiError}
          </p>
        )}
        <Explanation entry={entry} />
      </div>
    </article>
  );
}
