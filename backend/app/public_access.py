"""Public-demo boundaries: explicit browser origins and anonymous quotas."""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timezone
import os
from threading import Lock
import time
from urllib.parse import urlsplit


LOCAL_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000"


def configured_origins(raw: str | None = None) -> list[str]:
    values = (raw if raw is not None else os.environ.get("ALLOWED_ORIGINS", LOCAL_ORIGINS)).split(",")
    origins: list[str] = []
    for item in values:
        origin = item.strip().rstrip("/")
        if not origin or origin == "*":
            raise ValueError("ALLOWED_ORIGINS must contain explicit origins")
        parsed = urlsplit(origin)
        is_local = parsed.hostname in {"localhost", "127.0.0.1"}
        if (
            not parsed.netloc
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path
            or (parsed.scheme != "https" and not (is_local and parsed.scheme == "http"))
        ):
            raise ValueError("ALLOWED_ORIGINS must contain HTTPS origins without paths")
        if origin not in origins:
            origins.append(origin)
    return origins


class DemoLimitExceeded(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class DemoLimiter:
    """Small in-process quota suitable for a single free demo instance."""

    def __init__(self, requests_per_minute: int = 0, explanations_per_day: int = 0):
        self.requests_per_minute = max(0, requests_per_minute)
        self.explanations_per_day = max(0, explanations_per_day)
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._explanations: dict[tuple[str, str], int] = defaultdict(int)
        self._lock = Lock()

    @classmethod
    def from_environment(cls) -> "DemoLimiter":
        return cls(
            _nonnegative_int("DEMO_REQUESTS_PER_MINUTE"),
            _nonnegative_int("DEMO_EXPLANATIONS_PER_DAY"),
        )

    def check(self, client: str, *, explanation: bool = False, now: float | None = None) -> None:
        timestamp = time.time() if now is None else now
        day = datetime.fromtimestamp(timestamp, tz=timezone.utc).date().isoformat()
        key = client[:200] or "unknown"
        with self._lock:
            if explanation and self.explanations_per_day:
                daily_key = (key, day)
                if self._explanations[daily_key] >= self.explanations_per_day:
                    raise DemoLimitExceeded(
                        "DEMO_DAILY_LIMIT",
                        "今日的免费 AI 演示次数已用完，请明天再试。",
                    )
            if self.requests_per_minute:
                recent = self._requests[key]
                while recent and recent[0] <= timestamp - 60:
                    recent.popleft()
                if len(recent) >= self.requests_per_minute:
                    raise DemoLimitExceeded(
                        "DEMO_RATE_LIMIT",
                        "操作太频繁，请等待一分钟后重试。",
                    )
                recent.append(timestamp)
            if explanation and self.explanations_per_day:
                self._explanations[(key, day)] += 1


def client_key(forwarded_for: str | None, direct_host: str | None) -> str:
    if forwarded_for:
        # Managed proxies append the address they observed; use the rightmost value.
        candidate = forwarded_for.split(",")[-1].strip()
        if candidate:
            return candidate
    return direct_host or "unknown"


def _nonnegative_int(name: str) -> int:
    raw = os.environ.get(name, "0").strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be a non-negative integer") from exc
    if value < 0:
        raise ValueError(f"{name} must be a non-negative integer")
    return value
