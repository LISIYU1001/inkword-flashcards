export type ApiPath = "/api/parse" | "/api/explain" | "/api/ai/status";

const LOCAL_API_BASE = "http://127.0.0.1:8000";

export function resolveApiBase(
  configured = process.env.NEXT_PUBLIC_API_URL,
  _nodeEnv = process.env.NODE_ENV,
  hostname = typeof window === "undefined" ? undefined : window.location.hostname,
): string {
  const value = configured?.trim();
  if (!value) {
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return LOCAL_API_BASE;
    }
    throw new Error(
      "网站尚未配置 NEXT_PUBLIC_API_URL，暂时无法连接解析服务。",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_API_URL 必须是有效的 HTTPS 地址。");
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error("NEXT_PUBLIC_API_URL 必须使用 HTTPS（本机开发除外）。");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_API_URL 只能包含服务地址。");
  }
  return url.toString().replace(/\/$/, "");
}

export function apiUrl(
  path: ApiPath,
  configured = process.env.NEXT_PUBLIC_API_URL,
  nodeEnv = process.env.NODE_ENV,
  hostname = typeof window === "undefined" ? undefined : window.location.hostname,
): string {
  return `${resolveApiBase(configured, nodeEnv, hostname)}${path}`;
}
