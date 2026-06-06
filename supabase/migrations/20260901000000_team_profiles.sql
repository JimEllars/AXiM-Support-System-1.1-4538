-- supabase/migrations/20260901000000_team_profiles.sql
-- Task 1: Create a public operational directory for our internal team.

CREATE TABLE IF NOT EXISTS public.team_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    department TEXT
);

ALTER TABLE public.team_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated reads on team_profiles"
ON public.team_profiles
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated self-upsert"
ON public.team_profiles
FOR ALL
USING (auth.uid() = id);
