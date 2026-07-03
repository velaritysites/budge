ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS expenses_user_deleted_idx ON public.expenses (user_id, deleted_at);

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

UPDATE public.expenses SET category = 'housing_rent' WHERE category = 'housing';
UPDATE public.expenses SET category = 'transport_fuel' WHERE category = 'transport';

ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('housing_rent','transport_fuel','debt','subscriptions','food','groceries','vehicle_finance','insurance','medical_insurance','other'));