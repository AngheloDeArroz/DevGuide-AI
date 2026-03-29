"""
Centralized caching module for DevGuide AI.
Provides TTL-based in-memory caches for embeddings, search results, and LLM responses.
"""

import hashlib
import time
import threading
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# TTL Cache implementation
# ---------------------------------------------------------------------------

class TTLCache:
    """Thread-safe in-memory cache with per-entry TTL expiration."""

    def __init__(self, max_size: int = 512, default_ttl: int = 3600):
        self._cache: dict[str, tuple[float, any]] = {}
        self._lock = threading.Lock()
        self.max_size = max_size
        self.default_ttl = default_ttl  # seconds
        self.hits = 0
        self.misses = 0

    def get(self, key: str):
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self.misses += 1
                return None
            expire_at, value = entry
            if expire_at and time.time() > expire_at:
                del self._cache[key]
                self.misses += 1
                return None
            self.hits += 1
            return value

    def set(self, key: str, value, ttl: int | None = None):
        ttl = ttl if ttl is not None else self.default_ttl
        expire_at = time.time() + ttl if ttl > 0 else None  # 0 = no expiry
        with self._lock:
            # Evict oldest entries if at capacity
            if len(self._cache) >= self.max_size and key not in self._cache:
                self._evict(1)
            self._cache[key] = (expire_at, value)

    def invalidate(self, key: str):
        with self._lock:
            self._cache.pop(key, None)

    def invalidate_prefix(self, prefix: str):
        """Remove all entries whose key starts with *prefix*."""
        with self._lock:
            keys_to_remove = [k for k in self._cache if k.startswith(prefix)]
            for k in keys_to_remove:
                del self._cache[k]

    def clear(self):
        with self._lock:
            self._cache.clear()
            self.hits = 0
            self.misses = 0

    def stats(self) -> dict:
        with self._lock:
            return {
                "size": len(self._cache),
                "max_size": self.max_size,
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate": round(self.hits / max(self.hits + self.misses, 1), 3),
            }

    # -- internal --
    def _evict(self, count: int):
        """Remove *count* entries closest to expiration (no lock — caller holds it)."""
        # Sort by expire_at ascending; entries with None (no-expiry) go last
        sorted_keys = sorted(
            self._cache,
            key=lambda k: self._cache[k][0] or float("inf"),
        )
        for k in sorted_keys[:count]:
            del self._cache[k]


# ---------------------------------------------------------------------------
# Module-level cache instances
# ---------------------------------------------------------------------------

# Embeddings: keyed by content SHA-256, never expires (content-addressed)
embedding_cache = TTLCache(max_size=4096, default_ttl=0)

# Semantic search results: keyed by hash(question + repo_id), 1-hour TTL
search_cache = TTLCache(max_size=256, default_ttl=3600)

# LLM responses: keyed by hash(question + context), 1-hour TTL
llm_cache = TTLCache(max_size=256, default_ttl=3600)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def hash_key(*parts: str) -> str:
    """Create a deterministic cache key from multiple string parts."""
    combined = "|".join(parts)
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()
