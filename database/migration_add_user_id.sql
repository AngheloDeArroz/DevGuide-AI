-- Migration: Add user_id to repositories table
-- Run this in the Supabase SQL Editor

ALTER TABLE repositories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Optional: Create an index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_repositories_user_id ON repositories(user_id);
