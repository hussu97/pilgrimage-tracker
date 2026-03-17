import asyncio
import secrets
import threading
import time

import httpx
import requests

from app.logger import get_logger

logger = get_logger(__name__)


def generate_code(prefix: str) -> str:
    """Generate a unique code with the given prefix."""
    return f"{prefix}_{secrets.token_hex(4)}"


def make_request_with_backoff(method: str, url: str, **kwargs) -> requests.Response | None:
    """Make HTTP request with exponential backoff on rate limits."""
    kwargs.setdefault("timeout", (5, 30))
    wait_time = 5
    retries = 0
    max_retries = 5
    while retries < max_retries:
        try:
            response = requests.request(method, url, **kwargs)
            if response.status_code == 429:
                logger.warning("Rate limit hit (429) for %s. Retrying in %ss...", url, wait_time)
                time.sleep(wait_time)
                wait_time *= 2
                retries += 1
                continue
            return response
        except Exception as e:
            logger.error("Request error for %s: %s", url, e)
            return None
    return None


class RateLimiter:
    """
    Thread-safe per-endpoint token-bucket rate limiter with burst support.

    Each endpoint gets its own bucket with configurable requests-per-second and burst size.
    A threading.Condition per endpoint allows multiple tokens to be consumed in rapid
    succession (burst) before throttling kicks in — eliminating the serial lock contention
    that the old "last call + sleep" approach suffered when many workers competed for slots.

    Threads waiting for one endpoint do not block threads waiting for another.
    """

    DEFAULT_RATES: dict[str, float] = {
        "gmaps_search": 10.0,  # was 2.0 — Google allows ~100 QPS, keep conservative
        "gmaps_details": 15.0,  # was 5.0
        "gmaps_photo": 15.0,  # was 5.0 — CDN, not billed; still throttle slightly
        "overpass": 5.0,  # public Overpass API tolerates 5-10 RPS; was 1.0
        "osm": 1.0,
        "wikipedia": 5.0,
        "wikidata": 5.0,
        "knowledge_graph": 2.0,
        "besttime": 1.0,
        "foursquare": 2.0,
        "outscraper": 1.0,
    }

    # Burst size = max tokens that can be consumed before refill kicks in
    DEFAULT_BURST: int = 3

    def __init__(self, burst: int = DEFAULT_BURST) -> None:
        self._burst = burst
        self._meta_lock = threading.Lock()
        # Per-endpoint: (condition, tokens_float, last_refill_time)
        self._buckets: dict[str, tuple[threading.Condition, list]] = {}

    def _get_bucket(self, endpoint: str):
        with self._meta_lock:
            if endpoint not in self._buckets:
                rps = self.DEFAULT_RATES.get(endpoint, 1.0)
                cond = threading.Condition(threading.Lock())
                # Start full (burst tokens available)
                state = [float(self._burst), time.monotonic(), rps]
                self._buckets[endpoint] = (cond, state)
            return self._buckets[endpoint]

    def acquire(self, endpoint: str) -> None:
        """Block until a token is available for the given endpoint."""
        cond, state = self._get_bucket(endpoint)
        with cond:
            while True:
                now = time.monotonic()
                rps = state[2]
                elapsed = now - state[1]
                state[0] = min(float(self._burst), state[0] + elapsed * rps)
                state[1] = now
                if state[0] >= 1.0:
                    state[0] -= 1.0
                    return
                # Wait until the next token is available
                wait = (1.0 - state[0]) / rps
                cond.wait(timeout=wait)


class ThreadSafeIdSet:
    """
    Thread-safe set for deduplicating place IDs during parallel discovery.

    add_new() atomically filters and adds new IDs, returning only the new ones.
    """

    def __init__(self) -> None:
        self._set: set[str] = set()
        self._lock = threading.Lock()

    def add_new(self, ids: list[str]) -> list[str]:
        """Atomically filter already-seen IDs, add the new ones, return only the new ones."""
        with self._lock:
            new_ids = [id_ for id_ in ids if id_ not in self._set]
            self._set.update(new_ids)
            return new_ids

    def __len__(self) -> int:
        with self._lock:
            return len(self._set)

    def __contains__(self, item: object) -> bool:
        with self._lock:
            return item in self._set

    def to_list(self) -> list[str]:
        """Return a snapshot of all IDs currently in the set.

        Use list(set_instance) or iterate directly if you don't need the list
        object itself — both acquire the lock for a single copy operation.
        """
        with self._lock:
            return list(self._set)

    def __iter__(self):
        """Iterate over a snapshot of current IDs (acquires lock once for the copy)."""
        with self._lock:
            snapshot = list(self._set)
        return iter(snapshot)


class AtomicCounter:
    """Thread-safe integer counter for tracking progress across parallel workers."""

    def __init__(self, initial: int = 0) -> None:
        self._value = initial
        self._lock = threading.Lock()

    def increment(self, delta: int = 1) -> int:
        """Increment the counter by delta and return the new value."""
        with self._lock:
            self._value += delta
            return self._value

    @property
    def value(self) -> int:
        with self._lock:
            return self._value


# Module-level singleton — one rate limiter shared across all threads.
_rate_limiter_instance: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    """Return the global RateLimiter singleton, creating it on first call."""
    global _rate_limiter_instance
    if _rate_limiter_instance is None:
        _rate_limiter_instance = RateLimiter()
    return _rate_limiter_instance


class AsyncRateLimiter:
    """
    Async per-endpoint token-bucket rate limiter with burst support.

    Drop-in async counterpart to RateLimiter.  Uses asyncio.Lock to serialise
    token accounting and asyncio.sleep to yield control while waiting, so the
    event loop is never hard-blocked.

    One instance is shared across all coroutines (safe because asyncio is
    single-threaded — only one coroutine runs between await points).
    """

    DEFAULT_RATES: dict[str, float] = RateLimiter.DEFAULT_RATES
    DEFAULT_BURST: int = RateLimiter.DEFAULT_BURST

    def __init__(self, burst: int = DEFAULT_BURST) -> None:
        self._burst = burst
        self._lock = asyncio.Lock()
        # Per-endpoint: [tokens_float, last_refill_monotonic, rps]
        self._buckets: dict[str, list] = {}

    async def acquire(self, endpoint: str) -> None:
        """Async-block until a token is available for the given endpoint."""
        async with self._lock:
            if endpoint not in self._buckets:
                rps = self.DEFAULT_RATES.get(endpoint, 1.0)
                self._buckets[endpoint] = [float(self._burst), time.monotonic(), rps]
            bucket = self._buckets[endpoint]

        while True:
            async with self._lock:
                now = time.monotonic()
                rps = bucket[2]
                elapsed = now - bucket[1]
                bucket[0] = min(float(self._burst), bucket[0] + elapsed * rps)
                bucket[1] = now
                if bucket[0] >= 1.0:
                    bucket[0] -= 1.0
                    return
                wait = (1.0 - bucket[0]) / rps

            await asyncio.sleep(wait)


# Module-level async singleton.
_async_rate_limiter_instance: AsyncRateLimiter | None = None


def get_async_rate_limiter() -> AsyncRateLimiter:
    """Return the global AsyncRateLimiter singleton, creating it on first call."""
    global _async_rate_limiter_instance
    if _async_rate_limiter_instance is None:
        _async_rate_limiter_instance = AsyncRateLimiter()
    return _async_rate_limiter_instance


class CircuitBreaker:
    """
    Async circuit breaker for external API calls.

    After `failure_threshold` consecutive failures the circuit opens and all
    subsequent calls raise RuntimeError immediately, giving the downstream
    service time to recover.  After `reset_timeout_s` seconds the breaker
    enters the half-open state: the next call is allowed through.  On success
    it closes; on failure it opens again immediately.

    Usage::

        cb = CircuitBreaker(name="wikipedia")
        result = await cb.call(fetch_wikipedia(name))
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        reset_timeout_s: float = 60.0,
        name: str = "unnamed",
    ) -> None:
        self._failure_threshold = failure_threshold
        self._reset_timeout_s = reset_timeout_s
        self._name = name
        self._consecutive_failures = 0
        self._opened_at: float | None = None
        self._lock = asyncio.Lock()

    @property
    def is_open(self) -> bool:
        """True when the circuit is open and calls should be rejected."""
        if self._opened_at is None:
            return False
        if time.monotonic() - self._opened_at >= self._reset_timeout_s:
            return False  # half-open: allow next call through
        return True

    async def call(self, coro):
        """Execute *coro*, tracking success/failure.

        Raises RuntimeError immediately if the circuit is open.
        Re-raises any exception from *coro* after recording the failure.
        """
        async with self._lock:
            if self.is_open:
                raise RuntimeError(f"Circuit breaker '{self._name}' is open — skipping call")

        try:
            result = await coro
            async with self._lock:
                if self._consecutive_failures > 0:
                    logger.info("Circuit breaker '%s' closed after successful call", self._name)
                self._consecutive_failures = 0
                self._opened_at = None
            return result
        except Exception:
            async with self._lock:
                self._consecutive_failures += 1
                if self._consecutive_failures >= self._failure_threshold:
                    self._opened_at = time.monotonic()
                    logger.warning(
                        "Circuit breaker '%s' opened after %d consecutive failures",
                        self._name,
                        self._consecutive_failures,
                    )
            raise


async def async_request_with_backoff(
    method: str,
    url: str,
    client: httpx.AsyncClient | None = None,
    **kwargs,
) -> httpx.Response | None:
    """Async HTTP request with exponential backoff on rate limits (429).

    Uses the provided httpx.AsyncClient for connection reuse, or creates a
    one-shot client if none is given.
    """
    kwargs.setdefault("timeout", 35.0)
    wait_time = 5
    retries = 0
    max_retries = 5

    async def _do_request(c: httpx.AsyncClient) -> httpx.Response | None:
        nonlocal wait_time, retries
        while retries < max_retries:
            try:
                response = await c.request(method, url, **kwargs)
                if response.status_code == 429:
                    logger.warning("Rate limit hit (429) for %s. Retrying in %ss…", url, wait_time)
                    await asyncio.sleep(wait_time)
                    wait_time *= 2
                    retries += 1
                    continue
                return response
            except Exception as e:
                logger.error(
                    "Async request error for %s: %s: %s",
                    url,
                    type(e).__name__,
                    e,
                    exc_info=True,
                )
                return None
        return None

    if client is not None:
        return await _do_request(client)

    async with httpx.AsyncClient() as c:
        return await _do_request(c)
