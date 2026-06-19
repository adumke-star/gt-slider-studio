
-- 1) Sections table
CREATE TABLE public.slider_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('plp','pdp')),
  name text NOT NULL DEFAULT 'Slider',
  sort_order integer NOT NULL DEFAULT 0,
  external_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slider_sections TO anon, authenticated;
GRANT ALL ON public.slider_sections TO service_role;

ALTER TABLE public.slider_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read sections" ON public.slider_sections FOR SELECT USING (true);
CREATE POLICY "Public write sections" ON public.slider_sections FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update sections" ON public.slider_sections FOR UPDATE USING (true);
CREATE POLICY "Public delete sections" ON public.slider_sections FOR DELETE USING (true);

CREATE TRIGGER set_slider_sections_updated_at
  BEFORE UPDATE ON public.slider_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) section_id on slider_images
ALTER TABLE public.slider_images
  ADD COLUMN section_id uuid REFERENCES public.slider_sections(id) ON DELETE CASCADE;

-- 3) Backfill: create one PLP + one PDP section per race, then map images
INSERT INTO public.slider_sections (race_id, kind, name, sort_order)
SELECT r.id, k.kind, CASE k.kind WHEN 'plp' THEN 'PLP Slider' ELSE 'PDP Slider' END, 0
FROM public.races r
CROSS JOIN (VALUES ('plp'), ('pdp')) AS k(kind);

UPDATE public.slider_images si
SET section_id = ss.id
FROM public.slider_sections ss
WHERE ss.race_id = si.race_id
  AND ss.kind = si.area::text
  AND si.section_id IS NULL;

CREATE INDEX idx_slider_sections_race ON public.slider_sections(race_id);
CREATE INDEX idx_slider_images_section ON public.slider_images(section_id);
