
ALTER TABLE public.slider_sections
  ADD COLUMN external_links jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.slider_sections
SET external_links = jsonb_build_array(jsonb_build_object('label', 'Originale', 'url', external_url))
WHERE external_url IS NOT NULL AND external_url <> '';
