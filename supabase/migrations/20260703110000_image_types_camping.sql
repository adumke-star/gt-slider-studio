-- Add glamping and camping image types.
ALTER TABLE public.slider_images
  DROP CONSTRAINT IF EXISTS slider_images_image_type_check;
ALTER TABLE public.slider_images
  ADD CONSTRAINT slider_images_image_type_check
    CHECK (image_type IN ('compositing', 'race_action', 'fan_atmosphere', 'generic', 'glamping', 'camping'));
