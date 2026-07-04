
-- Income streams
CREATE TABLE public.income_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  gross_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_streams TO authenticated;
GRANT ALL ON public.income_streams TO service_role;
ALTER TABLE public.income_streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "streams self" ON public.income_streams FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER income_streams_updated BEFORE UPDATE ON public.income_streams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Profile notification prefs
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_notifications boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_token text;

-- Expense reminder fields
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS due_day integer,
  ADD COLUMN IF NOT EXISTS notify_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_lead_days integer NOT NULL DEFAULT 3;
