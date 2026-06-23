ALTER TABLE public.slider_images
  ADD COLUMN IF NOT EXISTS crop_area jsonb;

COMMENT ON COLUMN public.slider_images.crop_area IS
  'react-easy-crop croppedArea percentages {x,y,width,height}; null = center default';
