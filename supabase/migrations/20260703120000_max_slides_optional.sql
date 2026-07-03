-- No slide maximum by default: more than 6 images is allowed.
-- A max is only enforced when explicitly set per section.
ALTER TABLE public.slider_sections
  ALTER COLUMN max_slides DROP NOT NULL,
  ALTER COLUMN max_slides SET DEFAULT NULL;

-- Existing sections all carry the old default of 6 — clear it.
UPDATE public.slider_sections SET max_slides = NULL WHERE max_slides = 6;
