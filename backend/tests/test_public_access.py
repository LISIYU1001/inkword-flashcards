import pytest
from fastapi.testclient import TestClient

from app.public_access import DemoLimitExceeded, DemoLimiter, configured_origins


def test_configured_origins_accepts_explicit_https_and_local_development():
    assert configured_origins("https://inkword.pages.dev,http://127.0.0.1:3000") == [
        "https://inkword.pages.dev",
        "http://127.0.0.1:3000",
    ]


@pytest.mark.parametrize(
    "value",
    ["*", "http://inkword.pages.dev", "https://inkword.pages.dev/path", "not-a-url"],
)
def test_configured_origins_rejects_unsafe_or_malformed_values(value):
    with pytest.raises(ValueError):
        configured_origins(value)


def test_rate_limiter_rejects_burst_and_daily_explanation_overflow():
    burst = DemoLimiter(requests_per_minute=2, explanations_per_day=20)
    burst.check("visitor", now=100)
    burst.check("visitor", now=101)
    with pytest.raises(DemoLimitExceeded) as error:
        burst.check("visitor", now=102)
    assert error.value.code == "DEMO_RATE_LIMIT"

    daily = DemoLimiter(requests_per_minute=10, explanations_per_day=1)
    daily.check("visitor", explanation=True, now=100)
    with pytest.raises(DemoLimitExceeded) as error:
        daily.check("visitor", explanation=True, now=200)
    assert error.value.code == "DEMO_DAILY_LIMIT"


def test_cors_allows_configured_origin_and_denies_arbitrary_origin(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://inkword.pages.dev")
    from app.main import create_app

    client = TestClient(create_app())
    allowed = client.options(
        "/api/parse",
        headers={
            "Origin": "https://inkword.pages.dev",
            "Access-Control-Request-Method": "POST",
        },
    )
    denied = client.options(
        "/api/parse",
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://inkword.pages.dev"
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers


def test_health_response_exposes_no_configuration(monkeypatch):
    monkeypatch.setenv("AGNES_API_KEY", "must-not-leak")
    from app.main import create_app

    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert "must-not-leak" not in response.text


def test_exhausted_limit_returns_429_before_provider_call(monkeypatch):
    from app import main

    limiter = DemoLimiter(requests_per_minute=1, explanations_per_day=10)
    limiter.check("visitor")
    provider_called = False

    async def forbidden_provider_call(item):
        nonlocal provider_called
        provider_called = True
        raise AssertionError("provider must not run after the public demo limit")

    monkeypatch.setattr(main, "generate_explanation", forbidden_provider_call)
    response = TestClient(main.create_app(limiter=limiter)).post(
        "/api/explain",
        headers={"X-Forwarded-For": "visitor"},
        json={
            "entry_id": "one",
            "term": "keep pace with",
            "kind": "phrase",
            "context": "Education must keep pace with technology.",
        },
    )
    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "DEMO_RATE_LIMIT"
    assert provider_called is False
