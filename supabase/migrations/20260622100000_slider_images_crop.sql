ALTER TABLE public.slider_images
  ADD COLUMN IF NOT EXISTS crop_x real,
  ADD COLUMN IF NOT EXISTS crop_y real;

COMMENT ON COLUMN public.slider_images.crop_x IS 'Horizontal focal point 0–1 for cover crop; null = center (0.5)';
COMMENT ON COLUMN public.slider_images.crop_y IS 'Vertical focal point 0–1 for cover crop; null = center (0.5)';
