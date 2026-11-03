CREATE TABLE public.team_profiles (
id uuid PRIMARY KEY REFERENCES auth.users NOT NULL,
email text NOT NULL,
full_name text,
department text DEFAULT 'General Support'
);
ALTER TABLE public.team_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated reads on team_profiles" ON public.team_profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated self-upsert" ON public.team_profiles FOR ALL USING (auth.uid() = id);
