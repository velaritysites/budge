ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resume_date date,
  ADD COLUMN IF NOT EXISTS is_completed boolean NOT NULL DEFAULT false;

UPDATE public.savings_goals SET target_date = (CURRENT_DATE + INTERVAL '12 months')::date WHERE target_date IS NULL;

UPDATE public.savings_goals SET is_completed = true WHERE completed_at IS NOT NULL AND is_completed = false;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rn
  FROM public.savings_goals
)
UPDATE public.savings_goals g SET sort_order = o.rn
FROM ordered o WHERE g.id = o.id AND g.sort_order = 0;