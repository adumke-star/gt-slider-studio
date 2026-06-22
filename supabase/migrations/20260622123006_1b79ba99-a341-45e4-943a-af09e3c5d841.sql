ALTER TABLE public.slider_images
  ADD COLUMN IF NOT EXISTS crop_x real,
  ADD COLUMN IF NOT EXISTS crop_y real;