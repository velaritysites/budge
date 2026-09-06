CREATE TABLE public.tax_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  employment_type text NOT NULL DEFAULT 'salaried',
  is_provisional_taxpayer text NOT NULL DEFAULT 'no',
  home_office_enabled text NOT NULL DEFAULT 'no',
  home_office_area_m2 numeric NOT NULL DEFAULT 0,
  home_total_area_m2 numeric NOT NULL DEFAULT 0,
  has_travel_allowance boolean NOT NULL DEFAULT false,
  has_company_car boolean NOT NULL DEFAULT false,
  has_ra boolean NOT NULL DEFAULT false,
  ra_provider text,
  has_investment_income boolean NOT NULL DEFAULT false,
  age integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_profile TO authenticated;
GRANT ALL ON public.tax_profile TO service_role;

ALTER TABLE public.tax_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own tax profile"
  ON public.tax_profile FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER tax_profile_updated BEFORE UPDATE ON public.tax_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tax_year_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_year text NOT NULL,
  ra_contributions numeric NOT NULL DEFAULT 0,
  medical_aid_contributions numeric NOT NULL DEFAULT 0,
  home_office_deduction numeric NOT NULL DEFAULT 0,
  travel_deduction numeric NOT NULL DEFAULT 0,
  business_km numeric NOT NULL DEFAULT 0,
  donations numeric NOT NULL DEFAULT 0,
  professional_development numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tax_year)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_year_data TO authenticated;
GRANT ALL ON public.tax_year_data TO service_role;

ALTER TABLE public.tax_year_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own tax year data"
  ON public.tax_year_data FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER tax_year_data_updated BEFORE UPDATE ON public.tax_year_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS work_related boolean NOT NULL DEFAULT false;