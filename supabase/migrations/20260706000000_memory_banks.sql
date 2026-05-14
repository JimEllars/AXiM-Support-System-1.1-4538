CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.memory_banks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(384),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.memory_banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access for authenticated users"
ON public.memory_banks FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for service role"
ON public.memory_banks FOR INSERT
WITH CHECK (true);

CREATE OR REPLACE FUNCTION match_memory_banks (
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    mb.id,
    mb.title,
    mb.content,
    mb.metadata,
    1 - (mb.embedding <=> query_embedding) AS similarity
  FROM public.memory_banks mb
  WHERE 1 - (mb.embedding <=> query_embedding) > match_threshold
  ORDER BY mb.embedding <=> query_embedding
  LIMIT match_count;
$$;
