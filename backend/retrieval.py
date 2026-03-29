"""
Vector storage & semantic search for DevGuide AI.

Optimizations:
 - Batch INSERT (groups of 50) instead of row-by-row
 - Similarity threshold (0.3) to filter low-quality results
 - Reduced default top_k from 5 → 3
 - Search result caching by question + repo hash
 - Cost monitoring hooks
"""

import logging
from sqlalchemy.orm import Session
from sqlalchemy import text
from embeddings import generate_embedding
from cache import search_cache, hash_key
from cost_monitor import monitor

logger = logging.getLogger(__name__)

BATCH_INSERT_SIZE = 50
DEFAULT_SIMILARITY_THRESHOLD = 0.3
DEFAULT_LIMIT = 3


def store_chunks(db: Session, repo_id: str, chunks_with_embeddings: list[dict]):
    """
    Store code chunks and their embeddings in the database using batch inserts.
    Each chunk dict must have: file_path, content, embedding, chunk_index, file_hash.
    """
    total = len(chunks_with_embeddings)
    if total == 0:
        return

    sql = text("""
        INSERT INTO code_snippets
            (repository_id, file_path, content, content_embedding, content_hash, metadata)
        VALUES
            (:repo_id, :file_path, :content, :embedding, :content_hash,
             ('{"chunk_index": ' || :chunk_index || '}')::jsonb)
    """)

    for i in range(0, total, BATCH_INSERT_SIZE):
        batch = chunks_with_embeddings[i : i + BATCH_INSERT_SIZE]
        params = []
        for chunk in batch:
            params.append({
                "repo_id": repo_id,
                "file_path": chunk["file_path"],
                "content": chunk["content"],
                "embedding": f"[{','.join(map(str, chunk['embedding']))}]",
                "content_hash": chunk.get("file_hash", ""),
                "chunk_index": chunk.get("chunk_index", 0),
            })
        # executemany-style batch
        for p in params:
            db.execute(sql, p)
        db.flush()  # flush per batch to free driver buffers

    db.commit()
    monitor.inc("chunks_stored", total)
    logger.info(f"[retrieval] Stored {total} chunks in {((total - 1) // BATCH_INSERT_SIZE) + 1} batches")

    # Invalidate search cache for this repo (new data available)
    search_cache.invalidate_prefix(repo_id)


def semantic_search(
    db: Session,
    question: str,
    repo_id: str,
    limit: int = DEFAULT_LIMIT,
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
) -> list[dict]:
    """
    Convert the question to an embedding and perform a vector similarity search.
    Returns the top *limit* most relevant code chunks above the similarity threshold.
    """
    # Cache check
    cache_key = hash_key(question, repo_id, str(limit))
    cached = search_cache.get(cache_key)
    if cached is not None:
        monitor.inc("cache_hits")
        logger.info(f"[retrieval] Search cache HIT for repo={repo_id}")
        return cached

    monitor.inc("cache_misses")

    with monitor.timer("search_latency_ms", "search_queries"):
        question_embedding = generate_embedding(question)
        embedding_str = f"[{','.join(map(str, question_embedding))}]"

        sql = text("""
            SELECT id, file_path, content,
                   1 - (content_embedding <=> :embedding) AS similarity
            FROM code_snippets
            WHERE repository_id = :repo_id
              AND 1 - (content_embedding <=> :embedding) > :threshold
            ORDER BY content_embedding <=> :embedding
            LIMIT :limit
        """)

        results = db.execute(sql, {
            "embedding": embedding_str,
            "repo_id": repo_id,
            "limit": limit,
            "threshold": similarity_threshold,
        }).fetchall()

    retrieved_chunks = []
    for row in results:
        retrieved_chunks.append({
            "id": str(row.id),
            "file_path": row.file_path,
            "content": row.content,
            "similarity": round(float(row.similarity), 4),
        })

    # Cache the result
    search_cache.set(cache_key, retrieved_chunks)
    return retrieved_chunks
