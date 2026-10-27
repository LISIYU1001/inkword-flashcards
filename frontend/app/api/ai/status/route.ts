import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const response = await fetch(
      `${process.env.PDF_API_URL || "http://127.0.0.1:8000"}/api/ai/status`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) throw new Error("unavailable");
    return NextResponse.json(await response.json(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { configured: false, model: null, unavailable: true },
      { status: 503 },
    );
  }
}
