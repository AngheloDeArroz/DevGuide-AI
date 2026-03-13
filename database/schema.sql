-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Repositories Table
CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Code Snippets Table (Embeddings)
CREATE TABLE code_snippets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    content TEXT NOT NULL,
    content_embedding vector(384), -- Using sentence-transformers (all-MiniLM-L6-v2) 384 dims
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for vector search (HNSW is recommended for pgvector)
CREATE INDEX ON code_snippets USING hnsw (content_embedding vector_cosine_ops);
