import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  // Stream through with an enforced bound even when Content-Length is missing.
  const limit = 21 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    return NextResponse.json(
      { detail: { message: "文件超过 20 MB，请拆分后重试。" } },
      { status: 413 },
    );
  const reader = request.body?.getReader();
  if (!reader)
    return NextResponse.json(
      { detail: { message: "没有收到文件。" } },
      { status: 400 },
    );
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return NextResponse.json(
          { detail: { message: "上传内容过大。" } },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const response = await fetch(
      `${process.env.PDF_API_URL || "http://127.0.0.1:8000"}/api/parse`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            request.headers.get("content-type") || "application/octet-stream",
        },
        body: Buffer.concat(chunks),
        signal: AbortSignal.timeout(60000),
        cache: "no-store",
      },
    );
    const data = await response.json();
    return NextResponse.json(data, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        detail: {
          code: "BACKEND_UNAVAILABLE",
          message:
            "解析服务未启动或处理超时。请确认 FastAPI 正在本机 8000 端口运行，或拆分文件后重试。",
        },
      },
      { status: 503 },
    );
  } finally {
    reader.releaseLock();
  }
}
