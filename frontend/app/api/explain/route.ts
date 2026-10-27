import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader)
    return NextResponse.json(
      { detail: { message: "缺少词条。" } },
      { status: 400 },
    );
  try {
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32000) {
        await reader.cancel();
        return NextResponse.json(
          { detail: { message: "词条或上下文过长。" } },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const response = await fetch(
      `${process.env.PDF_API_URL || "http://127.0.0.1:8000"}/api/explain`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: Buffer.concat(chunks),
        signal: AbortSignal.timeout(50000),
        cache: "no-store",
      },
    );
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        detail: {
          code: "BACKEND_UNAVAILABLE",
          message: "AI 服务不可用或请求超时，请检查本机后端后重试。",
        },
      },
      { status: 503 },
    );
  } finally {
    reader.releaseLock();
  }
}
