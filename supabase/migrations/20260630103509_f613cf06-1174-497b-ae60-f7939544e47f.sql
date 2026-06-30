
-- Utility trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  pay_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (pay_frequency IN ('monthly','weekly','biweekly')),
  gross_income NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_income NUMERIC(14,2) NOT NULL DEFAULT 0,
  safety_buffer_pct NUMERIC(5,2) NOT NULL DEFAULT 12.5,
  onboarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- EXPENSES
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('housing','transport','debt','subscriptions','food','other')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','weekly','yearly','one_off')),
  is_fixed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expenses_user_idx ON public.expenses(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses self" ON public.expenses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SAVINGS GOALS
CREATE TABLE public.savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC(14,2) NOT NULL CHECK (target_amount > 0),
  current_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  target_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX savings_goals_user_idx ON public.savings_goals(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_goals TO authenticated;
GRANT ALL ON public.savings_goals TO service_role;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals self" ON public.savings_goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER goals_updated BEFORE UPDATE ON public.savings_goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- MONTHLY SNAPSHOTS
CREATE TABLE public.monthly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  net_income NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_income NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
  disposable_income NUMERIC(14,2) NOT NULL DEFAULT 0,
  savings_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  expenses_by_category JSONB NOT NULL DEFAULT '{}'::jsonb,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);
CREATE INDEX snapshots_user_month_idx ON public.monthly_snapshots(user_id, month DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_snapshots TO authenticated;
GRANT ALL ON public.monthly_snapshots TO service_role;
ALTER TABLE public.monthly_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots self" ON public.monthly_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER snapshots_updated BEFORE UPDATE ON public.monthly_snapshots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- AFFORDABILITY CHECKS
CREATE TABLE public.affordability_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  verdict TEXT NOT NULL CHECK (verdict IN ('comfortable','tight','not_recommended')),
  reasoning TEXT NOT NULL,
  disposable_at_check NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX checks_user_created_idx ON public.affordability_checks(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affordability_checks TO authenticated;
GRANT ALL ON public.affordability_checks TO service_role;
ALTER TABLE public.affordability_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checks self" ON public.affordability_checks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
