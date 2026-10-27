from fastapi.testclient import TestClient
from app.main import app
from test_parser import document

client = TestClient(app)


def test_upload_returns_evidence():
    response = client.post("/api/parse", files={"file": ("sample.pdf", document().tobytes(), "application/pdf")})
    assert response.status_code == 200
    assert response.json()["entries"][0]["term"] == "adapt"
    assert response.json()["entries"][0]["context_source"] == "pdf"


def test_invalid_pdf_returns_actionable_error():
    response = client.post("/api/parse", files={"file": ("bad.pdf", b"broken", "application/pdf")})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_PDF"


def test_upload_size_limit():
    response = client.post("/api/parse", files={"file": ("big.pdf", b"x"*(20*1024*1024+1), "application/pdf")})
    assert response.status_code == 413


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
