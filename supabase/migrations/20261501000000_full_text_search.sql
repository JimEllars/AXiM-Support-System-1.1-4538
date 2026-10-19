-- Add generated tsvector column for fast full-text search across subject and description
ALTER TABLE public.support_tickets
ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(subject, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B')
) STORED;

-- Create GIN index on the generated vector
CREATE INDEX IF NOT EXISTS idx_support_tickets_fts ON public.support_tickets USING GIN (fts);

-- Create index on customer_id for fast user ticket lookups
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON public.support_tickets (customer_id);
