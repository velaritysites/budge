CREATE TABLE public.statement_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  bank TEXT NOT NULL,
  statement_month TEXT,
  total_income NUMERIC NOT NULL DEFAULT 0,
  total_spent NUMERIC NOT NULL DEFAULT 0,
  category_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.statement_analyses TO authenticated;
GRANT ALL ON public.statement_analyses TO service_role;
ALTER TABLE public.statement_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own statement analyses" ON public.statement_analyses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX statement_analyses_user_created_idx ON public.statement_analyses (user_id, created_at DESC);