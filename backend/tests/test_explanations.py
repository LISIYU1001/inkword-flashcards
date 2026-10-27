import asyncio
import json

import httpx
import pytest
from openai import AsyncOpenAI
from fastapi.testclient import TestClient

from app.main import app
from app.explanations import ExplanationError, ExplainRequest, explain, build_instructions


PAYLOAD = {
    "chinese_meaning": "跟上；与……同步", "english_definition": "To progress as quickly as something else.",
    "part_of_speech": "verb phrase", "context_explanation": "这里指教育跟上技术发展的速度。",
    "usage_notes": "keep pace with + 名词，作为整体理解。",
    "example_en": "Training must keep pace with change.", "example_zh": "培训必须跟上变化。",
}
ITEM = {"entry_id": "one", "term": "keep pace with", "kind": "phrase", "context": "Education must keep pace with technology."}


def response_body(content=None, status="completed"):
    return {"id": "resp_test", "object": "response", "created_at": 1, "model": "gpt-4.1-mini", "status": status,
            "output": [{"type": "message", "id": "msg_test", "role": "assistant", "status": "completed",
                        "content": content or [{"type": "output_text", "text": json.dumps(PAYLOAD), "annotations": []}]}]}


def invoke(handler):
    async def run():
        async with AsyncOpenAI(api_key="test-only", max_retries=0, http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler))) as client:
            return await explain(ExplainRequest(**ITEM), client=client, model="gpt-4.1-mini")
    return asyncio.run(run())


def test_sdk_request_uses_strict_schema_and_keeps_original_context_out_of_model_output():
    observed = []
    def handler(request):
        observed.append(json.loads(request.content))
        return httpx.Response(200, json=response_body())
    result = invoke(handler)
    assert result.entry_id == "one"
    assert result.explanation.chinese_meaning == PAYLOAD["chinese_meaning"]
    assert result.source_context == ITEM["context"]
    assert result.provider == "openai"
    body = observed[0]
    assert body["store"] is False
    assert body["text"]["format"]["strict"] is True
    assert body["text"]["format"]["type"] == "json_schema"
    assert "source_context" not in body["text"]["format"]["schema"]["properties"]
    user_data = json.loads(body["input"][1]["content"])
    assert user_data == {"term": ITEM["term"], "kind": "phrase", "context": ITEM["context"]}
    assert "API" not in user_data


def test_word_and_phrase_have_different_instructions():
    assert build_instructions("word") != build_instructions("phrase")
    assert "整体" in build_instructions("phrase")


@pytest.mark.parametrize("status,code", [(401, "AI_AUTH_ERROR"), (429, "AI_RATE_LIMIT"), (500, "AI_UNAVAILABLE")])
def test_provider_failures_are_sanitized(status, code):
    def handler(request):
        return httpx.Response(status, json={"error": {"message": "secret-key-must-not-leak", "type": "api_error"}})
    with pytest.raises(ExplanationError) as err:
        invoke(handler)
    assert err.value.code == code
    assert "secret-key" not in str(err.value)


def test_refusal_not_replaced_with_fake_definition():
    with pytest.raises(ExplanationError) as err:
        invoke(lambda req: httpx.Response(200, json=response_body([{"type": "refusal", "refusal": "No"}])))
    assert err.value.code == "AI_REFUSAL"


def test_malformed_output_is_rejected():
    with pytest.raises(ExplanationError) as err:
        invoke(lambda req: httpx.Response(200, json=response_body([{"type": "output_text", "text": "{}", "annotations": []}])))
    assert err.value.code == "AI_INVALID_OUTPUT"


def test_timeout_not_retried_indefinitely():
    def handler(request):
        raise httpx.ReadTimeout("timeout", request=request)
    with pytest.raises(ExplanationError) as err:
        invoke(handler)
    assert err.value.code == "AI_TIMEOUT"


def test_incomplete_response_rejected():
    with pytest.raises(ExplanationError) as err:
        invoke(lambda req: httpx.Response(200, json=response_body(status="incomplete")))
    assert err.value.code == "AI_INCOMPLETE"


def test_missing_key_status_and_explain_errors(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client = TestClient(app)
    status = client.get("/api/ai/status")
    assert status.status_code == 200
    assert status.json()["configured"] is False
    response = client.post("/api/explain", json=ITEM)
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "AI_NOT_CONFIGURED"


def test_status_never_returns_key(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "private-key")
    response = TestClient(app).get("/api/ai/status")
    assert response.json()["configured"] is True
    assert "private-key" not in response.text


@pytest.mark.parametrize("changes", [{"context": " "}, {"term": "x"*201}, {"context": "x"*6001}, {"kind": "bad"}])
def test_invalid_input_is_rejected_before_provider(changes):
    response = TestClient(app).post("/api/explain", json={**ITEM, **changes})
    assert response.status_code == 422
