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
    Thread-safe per-endpoint token-bucket rate limiter.

    Each endpoint gets its own bucket with configurable requests-per-second.
    Threads waiting for one API do not block threads waiting for another.
    """

    DEFAULT_RATES: dict[str, float] = {
        "gmaps_search": 2.0,
        "gmaps_details": 5.0,
        "gmaps_photo": 5.0,
        "overpass": 1.0,
        "osm": 1.0,
        "wikipedia": 5.0,
        "wikidata": 5.0,
        "knowledge_graph": 2.0,
        "besttime": 1.0,
        "foursquare": 2.0,
        "outscraper": 1.0,
    }

    def __init__(self) -> None:
        self._meta_lock = threading.Lock()
        self._locks: dict[str, threading.Lock] = {}
        self._last_call: dict[str, float] = {}

    def _get_lock(self, endpoint: str) -> threading.Lock:
        with self._meta_lock:
            if endpoint not in self._locks:
                self._locks[endpoint] = threading.Lock()
                self._last_call[endpoint] = 0.0
            return self._locks[endpoint]

    def acquire(self, endpoint: str) -> None:
        """Block until a request slot is available for the given endpoint."""
        lock = self._get_lock(endpoint)
        rps = self.DEFAULT_RATES.get(endpoint, 1.0)
        min_interval = 1.0 / rps

        with lock:
            now = time.time()
            elapsed = now - self._last_call[endpoint]
            wait = min_interval - elapsed
            if wait > 0:
                time.sleep(wait)
            self._last_call[endpoint] = time.time()


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
