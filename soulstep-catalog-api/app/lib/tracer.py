"""Lightweight per-request tracer.

Usage
-----
Attach ``?_trace=1`` to any API request.  The response will include an
``X-Trace`` header containing a JSON breakdown:

    {
      "total_ms": 210.4,
      "python_ms": 38.1,           # total minus DB wait
      "spans": [
        {"name": "popular_places", "ms": 95.2},
        ...
      ],
      "db": {
        "count": 12,
        "total_ms": 172.3,
        "slowest_5": [{"sql": "SELECT place...", "ms": 88.1}, ...]
      }
    }

The tracer is stored in a ContextVar so it is isolated per asyncio task
(i.e. per HTTP request) with zero cross-request interference.
"""

import time
from collections.abc import Generator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field


@dataclass
class RequestTracer:
    _spans: list[tuple[str, float]] = field(default_factory=list)
    _queries: list[tuple[str, float]] = field(default_factory=list)
    _start: float = field(default_factory=time.perf_counter)

    @contextmanager
    def span(self, name: str) -> Generator[None, None, None]:
        t0 = time.perf_counter()
        try:
            yield
        finally:
            self._spans.append((name, round((time.perf_counter() - t0) * 1000, 1)))

    def record_query(self, statement: str, ms: float) -> None:
        preview = statement[:120].replace("\n", " ").strip()
        self._queries.append((preview, round(ms, 1)))

    def summary(self) -> dict:
        total_ms = round((time.perf_counter() - self._start) * 1000, 1)
        db_total = round(sum(ms for _, ms in self._queries), 1)
        return {
            "total_ms": total_ms,
            "python_ms": round(total_ms - db_total, 1),
            "spans": [{"name": n, "ms": ms} for n, ms in self._spans],
            "db": {
                "count": len(self._queries),
                "total_ms": db_total,
                "slowest_5": sorted(
                    [{"sql": s, "ms": ms} for s, ms in self._queries],
                    key=lambda x: x["ms"],
                    reverse=True,
                )[:5],
            },
        }


_tracer_var: ContextVar[RequestTracer | None] = ContextVar("request_tracer", default=None)


def get_tracer() -> RequestTracer | None:
    return _tracer_var.get()


def set_tracer(t: RequestTracer | None) -> None:
    _tracer_var.set(t)
