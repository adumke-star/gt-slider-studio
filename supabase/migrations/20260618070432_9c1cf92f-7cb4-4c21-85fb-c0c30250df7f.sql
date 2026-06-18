
CREATE TYPE public.race_series AS ENUM ('f1', 'motogp');
CREATE TYPE public.slider_area AS ENUM ('plp', 'pdp');
CREATE TYPE public.image_status AS ENUM ('live', 'image_done', 'todo', 'blank');

CREATE TABLE public.races (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  series public.race_series NOT NULL,
  race_date DATE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.slider_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id UUID NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  area public.slider_area NOT NULL,
  position INT NOT NULL DEFAULT 0,
  status public.image_status NOT NULL DEFAULT 'blank',
  title TEXT,
  original_path TEXT,
  original_url TEXT,
  compressed_path TEXT,
  compressed_url TEXT,
  original_size_kb INT,
  compressed_size_kb INT,
  format TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_slider_images_race_area ON public.slider_images(race_id, area, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.races TO anon, authenticated;
GRANT ALL ON public.races TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slider_images TO anon, authenticated;
GRANT ALL ON public.slider_images TO service_role;

ALTER TABLE public.races ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slider_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read races" ON public.races FOR SELECT USING (true);
CREATE POLICY "Public write races" ON public.races FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update races" ON public.races FOR UPDATE USING (true);
CREATE POLICY "Public delete races" ON public.races FOR DELETE USING (true);

CREATE POLICY "Public read images" ON public.slider_images FOR SELECT USING (true);
CREATE POLICY "Public write images" ON public.slider_images FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update images" ON public.slider_images FOR UPDATE USING (true);
CREATE POLICY "Public delete images" ON public.slider_images FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_races_updated BEFORE UPDATE ON public.races
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_images_updated BEFORE UPDATE ON public.slider_images
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
