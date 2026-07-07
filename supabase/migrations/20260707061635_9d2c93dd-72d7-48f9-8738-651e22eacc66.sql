
-- savings_goals additions
ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS progress_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weight numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_auto_period date;

-- profiles additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_allocation_mode text NOT NULL DEFAULT 'weighted',
  ADD COLUMN IF NOT EXISTS auto_contribution_timing text NOT NULL DEFAULT 'on_demand';

-- goal_contributions table
CREATE TABLE IF NOT EXISTS public.goal_contributions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  occurred_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  note text,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_contributions TO authenticated;
GRANT ALL ON public.goal_contributions TO service_role;

ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contributions self"
  ON public.goal_contributions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS goal_contributions_goal_id_idx
  ON public.goal_contributions (goal_id, occurred_on DESC);

CREATE TRIGGER goal_contributions_set_updated_at
  BEFORE UPDATE ON public.goal_contributions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
