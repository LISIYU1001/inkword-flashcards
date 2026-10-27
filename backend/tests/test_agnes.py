"""Provider contract tests use local HTTP fixtures, never live credentials."""
import asyncio
import json

import httpx
import pytest
from openai import AsyncOpenAI

from app.explanations import ExplainRequest, ExplanationError, explain, ai_status
from test_explanations import ITEM, PAYLOAD


def invoke(body=None, status=200):
    observed = []

    def handler(request):
        observed.append(request)
        return httpx.Response(status, json=body)

    async def run():
        async with AsyncOpenAI(api_key="test-only", base_url="https://apihub.agnes-ai.com/v1",
                               max_retries=0, http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler))) as client:
            return await explain(ExplainRequest(**ITEM), client=client, model="agnes-2.5-flash", provider="agnes")
    return asyncio.run(run()), observed


def response(content=None, finish="stop"):
    return {"id": "chatcmpl-test", "object": "chat.completion", "created": 1,
            "model": "agnes-2.5-flash", "choices": [{"index": 0,
            "message": {"role": "assistant", "content": content if content is not None else json.dumps(PAYLOAD)},
            "finish_reason": finish}], "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20}}


def test_agnes_uses_chat_endpoint_and_preserves_source():
    result, requests = invoke(response())
    assert result.provider == "agnes"
    assert result.source_context == ITEM["context"]
    assert result.explanation.chinese_meaning == "跟上；与……同步"
    assert str(requests[0].url) == "https://apihub.agnes-ai.com/v1/chat/completions"
    body = json.loads(requests[0].content)
    assert body["model"] == "agnes-2.5-flash"
    assert json.loads(body["messages"][1]["content"]) == {k: ITEM[k] for k in ("term", "kind", "context")}
    assert "chinese_meaning" in body["messages"][0]["content"]


@pytest.mark.parametrize("content", ["{}", "not json", json.dumps({**PAYLOAD, "example_en": " "}),
                                     json.dumps({**PAYLOAD, "source_context": "invented"})])
def test_agnes_invalid_output_is_never_saved(content):
    with pytest.raises(ExplanationError) as err:
        invoke(response(content))
    assert err.value.code == "AI_INVALID_OUTPUT"


def test_agnes_truncation_is_rejected_even_when_json_is_valid():
    with pytest.raises(ExplanationError) as err:
        invoke(response(finish="length"))
    assert err.value.code == "AI_INCOMPLETE"


@pytest.mark.parametrize("status,code", [(401, "AI_AUTH_ERROR"), (429, "AI_RATE_LIMIT"), (500, "AI_UNAVAILABLE")])
def test_agnes_errors_are_sanitized(status, code):
    with pytest.raises(ExplanationError) as err:
        invoke({"error": {"message": "private-test-key", "type": "api_error"}}, status)
    assert err.value.code == code
    assert "private-test-key" not in str(err.value)
    assert "OpenAI" not in str(err.value)


def test_provider_uses_own_key_only(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "agnes")
    monkeypatch.setenv("OPENAI_API_KEY", "other-provider-secret")
    monkeypatch.delenv("AGNES_API_KEY", raising=False)
    assert ai_status()["configured"] is False
    monkeypatch.setenv("AGNES_API_KEY", "agnes-private-key")
    status = ai_status()
    assert status["configured"] is True
    assert status["provider"] == "agnes"
    assert status["model"] == "agnes-2.5-flash"
    assert "private-key" not in json.dumps(status)

@pytest.mark.parametrize("body,code", [
    ({**response(), "choices": []}, "AI_INVALID_OUTPUT"),
    (response(finish="content_filter"), "AI_REFUSAL"),
    (response("```json\n{}\n```"), "AI_INVALID_OUTPUT"),
])
def test_empty_refused_or_non_json_agnes_results_are_rejected(body, code):
    with pytest.raises(ExplanationError) as err:
        invoke(body)
    assert err.value.code == code


def test_unknown_provider_does_not_fall_back_to_openai(monkeypatch):
    from app.explanations import generate_explanation
    monkeypatch.setenv("AI_PROVIDER", "typo")
    monkeypatch.setenv("OPENAI_API_KEY", "must-not-be-used")
    assert ai_status()["configured"] is False
    with pytest.raises(ExplanationError) as err:
        asyncio.run(generate_explanation(ExplainRequest(**ITEM)))
    assert err.value.code == "AI_CONFIG_ERROR"


def test_generation_routes_agnes_key_to_official_host(monkeypatch):
    import app.explanations as module
    monkeypatch.setenv("AI_PROVIDER", "agnes")
    monkeypatch.setenv("AGNES_API_KEY", "test-agnes-key")
    monkeypatch.setenv("OPENAI_API_KEY", "must-not-be-used")
    observed = []
    def handler(request):
        observed.append(request)
        return httpx.Response(200, json=response())
    real_client = AsyncOpenAI
    def client_factory(**kwargs):
        return real_client(**kwargs, http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(module, "AsyncOpenAI", client_factory)
    result = asyncio.run(module.generate_explanation(ExplainRequest(**ITEM)))
    assert result.provider == "agnes"
    assert observed[0].url.host == "apihub.agnes-ai.com"
    assert observed[0].headers["authorization"] == "Bearer test-agnes-key"

@pytest.mark.parametrize("wrapper", ["```json\n%s\n```", "```\n%s\n```"])
def test_complete_json_code_fence_from_live_agnes_is_accepted(wrapper):
    result, _ = invoke(response('\n\n' + wrapper % json.dumps(PAYLOAD)))
    assert result.explanation.chinese_meaning == PAYLOAD['chinese_meaning']


@pytest.mark.parametrize("text", ["Here is the result:\n```json\n%s\n```", "```json\n%s\n```\nextra", "```json\n%s"])
def test_surrounding_prose_and_incomplete_fences_remain_invalid(text):
    with pytest.raises(ExplanationError) as err:
        invoke(response(text % json.dumps(PAYLOAD)))
    assert err.value.code == 'AI_INVALID_OUTPUT'


@pytest.mark.parametrize("field", ["context_explanation", "usage_notes"])
def test_learning_explanations_must_be_chinese(field):
    english_only = {**PAYLOAD, field: "This explanation is entirely in English."}
    with pytest.raises(ExplanationError) as err:
        invoke(response(json.dumps(english_only)))
    assert err.value.code == "AI_INVALID_OUTPUT"
