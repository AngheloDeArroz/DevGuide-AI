"""
Cost & performance monitoring for DevGuide AI.
Tracks embedding counts, token usage, query counts, response latency,
and memory usage.  All metrics are thread-safe and JSON-exportable.
"""

import time
import threading
import logging
import os

try:
    import psutil  # optional — provides accurate memory stats
except ImportError:
    psutil = None

logger = logging.getLogger(__name__)


class CostMonitor:
    """Lightweight, thread-safe metrics collector."""

    def __init__(self):
        self._lock = threading.Lock()
        self._started_at = time.time()
        self._counters: dict[str, int | float] = {
            "embeddings_generated": 0,
            "embedding_batches": 0,
            "chunks_stored": 0,
            "search_queries": 0,
            "llm_calls": 0,
            "llm_tokens_approx": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "files_skipped_hash": 0,
            "files_skipped_size": 0,
            "files_skipped_binary": 0,
            "indexing_jobs": 0,
        }
        self._latencies: dict[str, list[float]] = {
            "embedding_latency_ms": [],
            "search_latency_ms": [],
            "llm_latency_ms": [],
        }

    # -- increment helpers --
    def inc(self, key: str, amount: int | float = 1):
        with self._lock:
            self._counters[key] = self._counters.get(key, 0) + amount

    def record_latency(self, key: str, ms: float):
        with self._lock:
            bucket = self._latencies.setdefault(key, [])
            bucket.append(ms)
            # Keep only last 200 samples to bound memory
            if len(bucket) > 200:
                bucket[:] = bucket[-200:]

    # -- context-manager timer --
    class _Timer:
        def __init__(self, monitor: "CostMonitor", latency_key: str, counter_key: str | None):
            self.monitor = monitor
            self.latency_key = latency_key
            self.counter_key = counter_key
            self.start = 0.0

        def __enter__(self):
            self.start = time.perf_counter()
            return self

        def __exit__(self, *_):
            elapsed_ms = (time.perf_counter() - self.start) * 1000
            self.monitor.record_latency(self.latency_key, elapsed_ms)
            if self.counter_key:
                self.monitor.inc(self.counter_key)

    def timer(self, latency_key: str, counter_key: str | None = None):
        """Usage: ``with monitor.timer("llm_latency_ms", "llm_calls"): ...``"""
        return self._Timer(self, latency_key, counter_key)

    # -- export --
    def snapshot(self) -> dict:
        with self._lock:
            latency_stats = {}
            for key, samples in self._latencies.items():
                if samples:
                    latency_stats[key] = {
                        "count": len(samples),
                        "avg_ms": round(sum(samples) / len(samples), 2),
                        "min_ms": round(min(samples), 2),
                        "max_ms": round(max(samples), 2),
                        "last_ms": round(samples[-1], 2),
                    }
                else:
                    latency_stats[key] = {"count": 0}

            mem = {}
            if psutil:
                proc = psutil.Process(os.getpid())
                mem_info = proc.memory_info()
                mem = {
                    "rss_mb": round(mem_info.rss / 1024 / 1024, 2),
                    "vms_mb": round(mem_info.vms / 1024 / 1024, 2),
                }
            else:
                # Fallback: basic memory estimate
                import sys
                mem = {"note": "install psutil for accurate memory stats"}

            return {
                "uptime_seconds": round(time.time() - self._started_at, 1),
                "counters": dict(self._counters),
                "latencies": latency_stats,
                "memory": mem,
            }

    def reset(self):
        with self._lock:
            for k in self._counters:
                self._counters[k] = 0
            for k in self._latencies:
                self._latencies[k] = []
            self._started_at = time.time()

    def log_summary(self):
        snap = self.snapshot()
        logger.info(f"[metrics] {snap}")


# Module-level singleton
monitor = CostMonitor()
