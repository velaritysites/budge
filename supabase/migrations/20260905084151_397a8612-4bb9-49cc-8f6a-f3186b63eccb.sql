-- 1. Monthly close + net worth on snapshots
ALTER TABLE public.monthly_snapshots
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS close_notes text,
  ADD COLUMN IF NOT EXISTS net_worth numeric,
  ADD COLUMN IF NOT EXISTS assets_total numeric,
  ADD COLUMN IF NOT EXISTS liabilities_total numeric;

DROP POLICY IF EXISTS "snapshots_no_update_when_locked" ON public.monthly_snapshots;
CREATE POLICY "snapshots_no_update_when_locked"
  ON public.monthly_snapshots FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND locked_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

-- 2. Monthly briefings
CREATE TABLE IF NOT EXISTS public.monthly_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month date NOT NULL,
  observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_briefings TO authenticated;
GRANT ALL ON public.monthly_briefings TO service_role;
ALTER TABLE public.monthly_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own briefings" ON public.monthly_briefings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER monthly_briefings_updated BEFORE UPDATE ON public.monthly_briefings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Net worth items
CREATE TABLE IF NOT EXISTS public.net_worth_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('asset','liability')),
  category text NOT NULL,
  label text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  depreciation_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.net_worth_items TO authenticated;
GRANT ALL ON public.net_worth_items TO service_role;
ALTER TABLE public.net_worth_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own net worth items" ON public.net_worth_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER net_worth_items_updated BEFORE UPDATE ON public.net_worth_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Tax profile flags
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS works_from_home boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provisional_taxpayer boolean NOT NULL DEFAULT false;

-- 5. Score calibration dataset
CREATE TABLE IF NOT EXISTS public.score_calibration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bureau text NOT NULL,
  estimated_score integer NOT NULL,
  real_score integer NOT NULL,
  gap integer NOT NULL,
  dti numeric NOT NULL DEFAULT 0,
  payment_consistency numeric NOT NULL DEFAULT 0,
  savings_rate numeric NOT NULL DEFAULT 0,
  utilisation numeric NOT NULL DEFAULT 0,
  expense_consistency numeric NOT NULL DEFAULT 0,
  reported_on date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.score_calibration TO authenticated;
GRANT ALL ON public.score_calibration TO service_role;
ALTER TABLE public.score_calibration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own calibration rows" ON public.score_calibration FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "insert own calibration rows" ON public.score_calibration FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 6. Global correction factors (readable by all signed-in users, written by the system)
CREATE TABLE IF NOT EXISTS public.score_corrections (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  corrections jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_size integer NOT NULL DEFAULT 0,
  mean_gap numeric NOT NULL DEFAULT 0,
  mean_abs_gap numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.score_corrections TO authenticated;
GRANT ALL ON public.score_corrections TO service_role;
ALTER TABLE public.score_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone signed in can read corrections" ON public.score_corrections FOR SELECT TO authenticated
  USING (true);
INSERT INTO public.score_corrections (id) VALUES (1) ON CONFLICT (id) DO NOTHING;