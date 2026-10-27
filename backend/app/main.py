from fastapi import FastAPI, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool
from threading import Lock
from .models import ParseResult
from .parser import ParseError, parse_pdf
from pathlib import Path
from dotenv import load_dotenv
from .explanations import ExplainRequest, ExplainResult, ExplanationError, ai_status, generate_explanation

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)

app = FastAPI(title="Inkword Learning API", version="0.2.0")
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
# PyMuPDF is not thread-safe; serialize calls inside each server process.
_parse_lock = Lock()


def _parse(data: bytes, filename: str):
    with _parse_lock:
        return parse_pdf(data, filename)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/parse", response_model=ParseResult)
async def upload_pdf(file: UploadFile = File(...)):
    try:
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, detail={"code": "FILE_TOO_LARGE", "message": "文件超过 20 MB，请压缩或拆分后重试。"})
        return await run_in_threadpool(_parse, data, file.filename or "document.pdf")
    except ParseError as exc:
        raise HTTPException(422, detail={"code": exc.code, "message": exc.message}) from exc
    finally:
        await file.close()


@app.get("/api/ai/status")
def get_ai_status():
    return ai_status()


@app.post("/api/explain", response_model=ExplainResult)
async def explain_entry(item: ExplainRequest):
    try:
        return await generate_explanation(item)
    except ExplanationError as exc:
        raise HTTPException(exc.status, detail={"code": exc.code, "message": exc.message}) from exc
