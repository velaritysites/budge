-- ============ profile additions ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS multi_currency_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS household_view boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS debt_strategy text,
  ADD COLUMN IF NOT EXISTS debt_extra_payment numeric NOT NULL DEFAULT 0;

-- ============ expenses multi-currency ============
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS original_amount numeric,
  ADD COLUMN IF NOT EXISTS original_currency text,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric;

-- ============ statement analyses subscriptions ============
ALTER TABLE public.statement_analyses
  ADD COLUMN IF NOT EXISTS subscription_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ============ debts ============
CREATE TABLE public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  interest_rate numeric NOT NULL DEFAULT 0,
  min_payment numeric NOT NULL DEFAULT 0,
  account_type text NOT NULL DEFAULT 'credit_card',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debts TO authenticated;
GRANT ALL ON public.debts TO service_role;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debts self" ON public.debts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER debts_updated BEFORE UPDATE ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ spending alerts ============
CREATE TABLE public.spending_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  period text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  average numeric NOT NULL DEFAULT 0,
  pct_above numeric NOT NULL DEFAULT 0,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, period)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spending_alerts TO authenticated;
GRANT ALL ON public.spending_alerts TO service_role;
ALTER TABLE public.spending_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts self" ON public.spending_alerts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ subscription reviews ============
CREATE TABLE public.subscription_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  marked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_reviews TO authenticated;
GRANT ALL ON public.subscription_reviews TO service_role;
ALTER TABLE public.subscription_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscription reviews self" ON public.subscription_reviews FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER subscription_reviews_updated BEFORE UPDATE ON public.subscription_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ benchmarks ============
CREATE TABLE public.benchmark_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month date NOT NULL,
  income_bracket text NOT NULL,
  category_pcts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benchmark_samples TO authenticated;
GRANT ALL ON public.benchmark_samples TO service_role;
ALTER TABLE public.benchmark_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "benchmark samples self" ON public.benchmark_samples FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER benchmark_samples_updated BEFORE UPDATE ON public.benchmark_samples
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.spending_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  income_bracket text NOT NULL,
  category text NOT NULL,
  avg_pct numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (income_bracket, category)
);
GRANT SELECT ON public.spending_benchmarks TO authenticated;
GRANT ALL ON public.spending_benchmarks TO service_role;
ALTER TABLE public.spending_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "benchmarks readable by signed in users" ON public.spending_benchmarks
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.refresh_spending_benchmarks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.spending_benchmarks (income_bracket, category, avg_pct, sample_size, updated_at)
  SELECT s.income_bracket,
         kv.key AS category,
         AVG((kv.value)::numeric) AS avg_pct,
         COUNT(DISTINCT s.user_id) AS sample_size,
         now()
  FROM public.benchmark_samples s
  CROSS JOIN LATERAL jsonb_each_text(s.category_pcts) AS kv(key, value)
  WHERE s.month >= (date_trunc('month', now()) - interval '3 months')::date
  GROUP BY s.income_bracket, kv.key
  ON CONFLICT (income_bracket, category) DO UPDATE
    SET avg_pct = EXCLUDED.avg_pct,
        sample_size = EXCLUDED.sample_size,
        updated_at = now();
END;
$$;

-- ============ household ============
CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id),
  UNIQUE (user_id)
);
CREATE TABLE public.household_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.households TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_invites TO authenticated;
GRANT ALL ON public.households TO service_role;
GRANT ALL ON public.household_members TO service_role;
GRANT ALL ON public.household_invites TO service_role;

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_household_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.household_members WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.shares_household_with(_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members a
    JOIN public.household_members b ON a.household_id = b.household_id
    WHERE a.user_id = auth.uid() AND b.user_id = _other
  );
$$;

CREATE POLICY "households members read" ON public.households FOR SELECT TO authenticated
  USING (id = public.my_household_id() OR owner_id = auth.uid());
CREATE POLICY "households owner writes" ON public.households FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "households owner deletes" ON public.households FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "household members read" ON public.household_members FOR SELECT TO authenticated
  USING (household_id = public.my_household_id() OR user_id = auth.uid());
CREATE POLICY "household members join" ON public.household_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR household_id IN (SELECT id FROM public.households WHERE owner_id = auth.uid()));
CREATE POLICY "household members leave" ON public.household_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR household_id = public.my_household_id());

CREATE POLICY "household invites read" ON public.household_invites FOR SELECT TO authenticated
  USING (invited_by = auth.uid() OR household_id = public.my_household_id() OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
CREATE POLICY "household invites create" ON public.household_invites FOR INSERT TO authenticated
  WITH CHECK (invited_by = auth.uid());
CREATE POLICY "household invites update" ON public.household_invites FOR UPDATE TO authenticated
  USING (invited_by = auth.uid() OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  WITH CHECK (true);
CREATE POLICY "household invites delete" ON public.household_invites FOR DELETE TO authenticated
  USING (invited_by = auth.uid());

CREATE TRIGGER households_updated BEFORE UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER household_invites_updated BEFORE UPDATE ON public.household_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- household partners can read each other's financial rows
CREATE POLICY "household partner reads expenses" ON public.expenses FOR SELECT TO authenticated
  USING (public.shares_household_with(user_id));
CREATE POLICY "household partner reads income" ON public.income_streams FOR SELECT TO authenticated
  USING (public.shares_household_with(user_id));
CREATE POLICY "household partner reads profile" ON public.profiles FOR SELECT TO authenticated
  USING (public.shares_household_with(id));