-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Repositories Table
CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Code Snippets Table (Embeddings)
CREATE TABLE code_snippets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    content TEXT NOT NULL,
    content_embedding vector(384), -- sentence-transformers all-MiniLM-L6-v2 = 384 dims
    content_hash VARCHAR(64),      -- SHA-256 hash for change detection
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- HNSW index for fast approximate nearest-neighbor search
-- m=16, ef_construction=64 balances recall vs build speed
CREATE INDEX idx_code_snippets_embedding
    ON code_snippets
    USING hnsw (content_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Speed up WHERE repository_id = ? filter in vector search
CREATE INDEX idx_code_snippets_repo_id
    ON code_snippets (repository_id);

-- Speed up hash-based deduplication lookups
CREATE INDEX idx_code_snippets_repo_hash
    ON code_snippets (repository_id, content_hash);

-- Conversations Table (chat sessions per user+repo)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Messages Table (individual Q&A pairs within a conversation)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    context JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── Migration helper (run on existing databases) ─────────────────────────
-- ALTER TABLE code_snippets ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
-- CREATE INDEX IF NOT EXISTS idx_code_snippets_repo_hash ON code_snippets (repository_id, content_hash);
-- CREATE INDEX IF NOT EXISTS idx_code_snippets_repo_id ON code_snippets (repository_id);
