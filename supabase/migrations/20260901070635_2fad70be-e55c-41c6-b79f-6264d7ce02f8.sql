ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

UPDATE public.expenses SET category = 'housing'        WHERE category = 'housing_rent';
UPDATE public.expenses SET category = 'transport'      WHERE category = 'transport_fuel';
UPDATE public.expenses SET category = 'medical_aid'    WHERE category = 'medical_insurance';
UPDATE public.expenses SET category = 'debt_repayments' WHERE category = 'debt';
UPDATE public.expenses SET category = 'eating_out'     WHERE category = 'food';

-- monthly snapshot jsonb keys
UPDATE public.monthly_snapshots ms
SET expenses_by_category = (
  SELECT COALESCE(jsonb_object_agg(
    CASE k
      WHEN 'housing_rent' THEN 'housing'
      WHEN 'transport_fuel' THEN 'transport'
      WHEN 'medical_insurance' THEN 'medical_aid'
      WHEN 'debt' THEN 'debt_repayments'
      WHEN 'food' THEN 'eating_out'
      ELSE k
    END, v), '{}'::jsonb)
  FROM jsonb_each(ms.expenses_by_category) AS t(k, v)
)
WHERE ms.expenses_by_category IS NOT NULL;

-- planner plan phase items
UPDATE public.planner_plans
SET phases = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN jsonb_typeof(phase->'items') = 'array' THEN jsonb_set(phase, '{items}', (
      SELECT COALESCE(jsonb_agg(
        CASE item->>'category'
          WHEN 'housing_rent' THEN jsonb_set(item, '{category}', '"housing"')
          WHEN 'transport_fuel' THEN jsonb_set(item, '{category}', '"transport"')
          WHEN 'medical_insurance' THEN jsonb_set(item, '{category}', '"medical_aid"')
          WHEN 'debt' THEN jsonb_set(item, '{category}', '"debt_repayments"')
          WHEN 'food' THEN jsonb_set(item, '{category}', '"eating_out"')
          ELSE item
        END), '[]'::jsonb)
      FROM jsonb_array_elements(phase->'items') AS item
    )) ELSE phase END), '[]'::jsonb)
  FROM jsonb_array_elements(planner_plans.phases) AS phase
)
WHERE jsonb_typeof(phases) = 'array';

ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check CHECK (category = ANY (ARRAY[
  'housing','transport','vehicle_finance','insurance','medical_aid','debt_repayments',
  'groceries','eating_out','coffee_drinks','household',
  'clothing_shopping','health_beauty','subscriptions','entertainment','tech_gadgets','phone_airtime',
  'giving_charity','education','childcare','pets',
  'savings','investments','side_business',
  'travel_holidays','government_admin','other'
]));