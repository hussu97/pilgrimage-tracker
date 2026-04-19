"""
Unit tests for RateLimiter, ThreadSafeIdSet, and AtomicCounter in app/scrapers/base.py.
"""

import os
import sys
import threading
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── RateLimiter ───────────────────────────────────────────────────────────────


class TestRateLimiter:
    def test_first_call_does_not_sleep(self):
        """First acquire() for a fresh endpoint should not sleep."""
        from app.scrapers.base import RateLimiter

        rl = RateLimiter()
        start = time.monotonic()
        rl.acquire("gmaps_search")
        elapsed = time.monotonic() - start
        # Should complete almost instantly (well under 100 ms)
        assert elapsed < 0.1

    def test_rapid_second_call_is_throttled(self):
        """Calls beyond the burst window should enforce the rate limit."""
        from app.scrapers.base import RateLimiter

        # burst=1 so any second call must wait
        rl = RateLimiter(burst=1)
        rl.acquire("gmaps_search")  # exhausts the single burst token (20 rps → 0.05 s interval)
        start = time.monotonic()
        rl.acquire("gmaps_search")
        elapsed = time.monotonic() - start
        # Must have waited at least ~0.04 s (allow tolerance for 20 rps)
        assert elapsed >= 0.04

    def test_different_endpoints_are_independent(self):
        """Acquiring one endpoint does not delay another."""
        from app.scrapers.base import RateLimiter

        rl = RateLimiter()
        rl.acquire("gmaps_search")  # prime gmaps_search
        start = time.monotonic()
        rl.acquire("wikipedia")  # different endpoint — should not wait
        elapsed = time.monotonic() - start
        assert elapsed < 0.1

    def test_unknown_endpoint_defaults_to_one_rps(self):
        """An unknown endpoint defaults to 1 rps (1-second min interval after burst exhausted)."""
        from app.scrapers.base import RateLimiter

        # burst=1 so the second call must wait the full interval
        rl = RateLimiter(burst=1)
        rl.acquire("totally_unknown")  # exhausts burst token (1 rps → 1 s interval)
        start = time.monotonic()
        rl.acquire("totally_unknown")
        elapsed = time.monotonic() - start
        assert elapsed >= 0.9  # ~1 s interval

    def test_concurrent_access_same_endpoint(self):
        """Multiple threads acquiring the same endpoint should all succeed."""
        from app.scrapers.base import RateLimiter

        rl = RateLimiter()
        results = []
        lock = threading.Lock()

        def _acquire():
            rl.acquire("wikipedia")  # 5 rps
            with lock:
                results.append(time.monotonic())

        threads = [threading.Thread(target=_acquire) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        assert len(results) == 5, "All threads should have completed"

    def test_get_rate_limiter_returns_singleton(self):
        """get_rate_limiter() should return the same object every time."""
        from app.scrapers.base import get_rate_limiter

        a = get_rate_limiter()
        b = get_rate_limiter()
        assert a is b


# ── ThreadSafeIdSet ───────────────────────────────────────────────────────────


class TestThreadSafeIdSet:
    def test_add_new_returns_only_new_ids(self):
        from app.scrapers.base import ThreadSafeIdSet

        s = ThreadSafeIdSet()
        new = s.add_new(["a", "b", "c"])
        assert set(new) == {"a", "b", "c"}
        # Second call — same ids are now known
        new2 = s.add_new(["b", "c", "d"])
        assert set(new2) == {"d"}

    def test_len_is_thread_safe(self):
        from app.scrapers.base import ThreadSafeIdSet

        s = ThreadSafeIdSet()
        s.add_new(["x", "y"])
        assert len(s) == 2

    def test_contains_works(self):
        from app.scrapers.base import ThreadSafeIdSet

        s = ThreadSafeIdSet()
        s.add_new(["hello"])
        assert "hello" in s
        assert "world" not in s

    def test_concurrent_add_new_no_duplicates(self):
        """Parallel add_new() calls must not produce duplicate IDs."""
        from app.scrapers.base import ThreadSafeIdSet

        s = ThreadSafeIdSet()
        all_new: list[str] = []
        lock = threading.Lock()

        def _add(ids: list[str]):
            new = s.add_new(ids)
            with lock:
                all_new.extend(new)

        # 10 threads each "discover" the same 100 IDs
        ids = [f"place_{i}" for i in range(100)]
        threads = [threading.Thread(target=_add, args=(ids,)) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Each ID should appear exactly once across all returned new-lists
        assert len(all_new) == 100
        assert len(set(all_new)) == 100

    def test_empty_input(self):
        from app.scrapers.base import ThreadSafeIdSet

        s = ThreadSafeIdSet()
        assert s.add_new([]) == []
        assert len(s) == 0


# ── AtomicCounter ─────────────────────────────────────────────────────────────


class TestAtomicCounter:
    def test_initial_value(self):
        from app.scrapers.base import AtomicCounter

        c = AtomicCounter(10)
        assert c.value == 10

    def test_increment_returns_new_value(self):
        from app.scrapers.base import AtomicCounter

        c = AtomicCounter()
        assert c.increment() == 1
        assert c.increment(5) == 6

    def test_concurrent_increments_are_accurate(self):
        """10 threads each incrementing 100 times should yield exactly 1000."""
        from app.scrapers.base import AtomicCounter

        c = AtomicCounter()

        def _inc():
            for _ in range(100):
                c.increment()

        threads = [threading.Thread(target=_inc) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert c.value == 1000

    def test_value_property_is_thread_safe(self):
        from app.scrapers.base import AtomicCounter

        c = AtomicCounter(42)
        assert c.value == 42
