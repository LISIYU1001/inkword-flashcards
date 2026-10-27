from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from threading import Lock
from .models import ParseResult
from .parser import ParseError, parse_pdf
from pathlib import Path
from dotenv import load_dotenv
from .explanations import ExplainRequest, ExplainResult, ExplanationError, ai_status, generate_explanation
from .public_access import DemoLimitExceeded, DemoLimiter, client_key, configured_origins

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
# PyMuPDF is not thread-safe; serialize calls inside each server process.
_parse_lock = Lock()


def _parse(data: bytes, filename: str):
    with _parse_lock:
        return parse_pdf(data, filename)


def create_app(*, limiter: DemoLimiter | None = None) -> FastAPI:
    application = FastAPI(title="Inkword Learning API", version="0.2.0")
    application.state.demo_limiter = limiter or DemoLimiter.from_environment()
    application.add_middleware(
        CORSMiddleware,
        allow_origins=configured_origins(),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    def enforce(request: Request, *, explanation: bool = False) -> None:
        key = client_key(
            request.headers.get("x-forwarded-for"),
            request.client.host if request.client else None,
        )
        try:
            application.state.demo_limiter.check(key, explanation=explanation)
        except DemoLimitExceeded as exc:
            raise HTTPException(429, detail={"code": exc.code, "message": exc.message}) from exc

    @application.get("/health")
    def health():
        return {"status": "ok"}

    @application.post("/api/parse", response_model=ParseResult)
    async def upload_pdf(request: Request, file: UploadFile = File(...)):
        enforce(request)
        try:
            data = await file.read(MAX_UPLOAD_BYTES + 1)
            if len(data) > MAX_UPLOAD_BYTES:
                raise HTTPException(413, detail={"code": "FILE_TOO_LARGE", "message": "文件超过 20 MB，请压缩或拆分后重试。"})
            return await run_in_threadpool(_parse, data, file.filename or "document.pdf")
        except ParseError as exc:
            raise HTTPException(422, detail={"code": exc.code, "message": exc.message}) from exc
        finally:
            await file.close()

    @application.get("/api/ai/status")
    def get_ai_status():
        return ai_status()

    @application.post("/api/explain", response_model=ExplainResult)
    async def explain_entry(request: Request, item: ExplainRequest):
        enforce(request, explanation=True)
        try:
            return await generate_explanation(item)
        except ExplanationError as exc:
            raise HTTPException(exc.status, detail={"code": exc.code, "message": exc.message}) from exc

    return application


app = create_app()
