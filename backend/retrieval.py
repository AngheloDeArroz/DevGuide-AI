from sqlalchemy.orm import Session
from sqlalchemy import text
from embeddings import generate_embedding

def store_chunks(db: Session, repo_id: str, chunks_with_embeddings: list[dict]):
    """Stores code chunks and their embeddings in the database."""
    # Note: For production, consider using bulk inserts for better performance.
    for chunk in chunks_with_embeddings:
        # Assuming table is code_snippets and repo is repositories
        # In a real app we'd use SQLAlchemy ORM models, but raw SQL is often faster for vector inserts.
        sql = text("""
            INSERT INTO code_snippets (repository_id, file_path, content, content_embedding, metadata)
            VALUES (:repo_id, :file_path, :content, :embedding, ('{"chunk_index": ' || :chunk_index || '}')::jsonb)
        """)
        
        db.execute(sql, {
            "repo_id": repo_id,
            "file_path": chunk["file_path"],
            "content": chunk["content"],
            "embedding": f"[{','.join(map(str, chunk['embedding']))}]", # Formatting for pgvector
            "chunk_index": chunk.get("chunk_index", 0)
        })
        
    db.commit()

def semantic_search(db: Session, question: str, repo_id: str, limit: int = 5) -> list[dict]:
    """
    Converts the question to an embedding and performs a vector similarity search.
    Returns the top 'limit' most relevant code chunks.
    """
    question_embedding = generate_embedding(question)
    embedding_str = f"[{','.join(map(str, question_embedding))}]"
    
    # Vector cosine similarity using pgvector's <=> operator
    sql = text("""
        SELECT id, file_path, content, 
               1 - (content_embedding <=> :embedding) as similarity
        FROM code_snippets
        WHERE repository_id = :repo_id
        ORDER BY content_embedding <=> :embedding
        LIMIT :limit
    """)
    
    results = db.execute(sql, {
        "embedding": embedding_str,
        "repo_id": repo_id,
        "limit": limit
    }).fetchall()
    
    # Format results
    retrieved_chunks = []
    for row in results:
        retrieved_chunks.append({
            "id": str(row.id),
            "file_path": row.file_path,
            "content": row.content,
            "similarity": float(row.similarity)
        })
        
    return retrieved_chunks
