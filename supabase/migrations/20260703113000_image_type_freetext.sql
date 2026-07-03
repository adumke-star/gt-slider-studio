-- Image type becomes free text: rule-relevant types are recognized in the app,
-- everything else (locations, campaigns, ...) is allowed as a plain label.
ALTER TABLE public.slider_images
  DROP CONSTRAINT IF EXISTS slider_images_image_type_check;
