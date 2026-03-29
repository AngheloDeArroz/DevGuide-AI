"""
Embedding generation for DevGuide AI.

Optimizations:
 - Batch-aware encoding with configurable batch size
 - Content-hash-based caching (avoids re-embedding identical text)
 - Cost monitoring hooks
"""

import logging
from sentence_transformers import SentenceTransformer
from cache import embedding_cache, hash_key
from cost_monitor import monitor

logger = logging.getLogger(__name__)

# Load model once at import time
model = SentenceTransformer("all-MiniLM-L6-v2")

# Match sentence-transformers internal default
BATCH_SIZE = 32


def generate_embeddings(texts: list[str], use_cache: bool = True) -> list[list[float]]:
    """
    Generate embeddings for a list of text chunks.

    If *use_cache* is True, already-computed embeddings (keyed by content hash)
    are returned from cache without hitting the model.
    """
    if not texts:
        return []

    results: list[list[float] | None] = [None] * len(texts)
    texts_to_encode: list[str] = []
    encode_indices: list[int] = []

    # Check cache first
    for i, text in enumerate(texts):
        if use_cache:
            key = hash_key(text)
            cached = embedding_cache.get(key)
            if cached is not None:
                results[i] = cached
                monitor.inc("cache_hits")
                continue
        texts_to_encode.append(text)
        encode_indices.append(i)

    cache_miss_count = len(texts_to_encode)
    if cache_miss_count:
        monitor.inc("cache_misses", cache_miss_count)
        logger.info(f"[embeddings] Encoding {cache_miss_count} texts (cache hit {len(texts) - cache_miss_count})")

        with monitor.timer("embedding_latency_ms", "embedding_batches"):
            raw = model.encode(texts_to_encode, batch_size=BATCH_SIZE, show_progress_bar=False)

        for j, idx in enumerate(encode_indices):
            vec = raw[j].tolist()
            results[idx] = vec
            if use_cache:
                embedding_cache.set(hash_key(texts_to_encode[j]), vec, ttl=0)  # no expiry

        monitor.inc("embeddings_generated", cache_miss_count)

    return results  # type: ignore[return-value]


def generate_embedding(text: str) -> list[float]:
    """Generate an embedding for a single text string."""
    return generate_embeddings([text])[0]
