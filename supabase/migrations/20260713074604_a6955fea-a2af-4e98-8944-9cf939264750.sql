CREATE TABLE public.planner_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  tax_rate_pct numeric NOT NULL DEFAULT 25,
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planner_plans TO authenticated;
GRANT ALL ON public.planner_plans TO service_role;

ALTER TABLE public.planner_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own planner plans"
ON public.planner_plans FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_planner_plans_updated_at
BEFORE UPDATE ON public.planner_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX planner_plans_user_id_idx ON public.planner_plans(user_id, updated_at DESC);