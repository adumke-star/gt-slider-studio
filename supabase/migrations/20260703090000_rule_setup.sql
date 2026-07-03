-- Rule setup: image categorization, per-section slide limit, manual rule checklist.

-- Rules 3/4/6 need to know what kind of image this is and which season it shows.
ALTER TABLE public.slider_images
  ADD COLUMN IF NOT EXISTS image_type text
    CHECK (image_type IN ('compositing', 'race_action', 'fan_atmosphere', 'generic')),
  ADD COLUMN IF NOT EXISTS season integer
    CHECK (season BETWEEN 2000 AND 2100);

-- Rule 2: max slides per section (default 6, matches rule 1 minimum).
ALTER TABLE public.slider_sections
  ADD COLUMN IF NOT EXISTS max_slides integer NOT NULL DEFAULT 6
    CHECK (max_slides BETWEEN 1 AND 30);

-- Rules 8/9: human-judgment checks ticked off manually per race.
CREATE TABLE IF NOT EXISTS public.race_rule_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (race_id, rule_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.race_rule_checks TO authenticated;
GRANT ALL ON public.race_rule_checks TO service_role;
ALTER TABLE public.race_rule_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage rule checks" ON public.race_rule_checks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
