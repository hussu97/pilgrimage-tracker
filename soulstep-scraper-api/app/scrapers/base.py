import secrets
import threading
import time

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
        "overpass": 1.0,
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
        """Return a snapshot of all IDs currently in the set."""
        with self._lock:
            return list(self._set)


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
