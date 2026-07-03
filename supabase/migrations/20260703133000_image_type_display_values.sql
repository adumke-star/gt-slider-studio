-- Unify stored type values with the new fixed suggestion list.
UPDATE public.slider_images SET image_type = 'Glamping/Camping' WHERE image_type IN ('glamping', 'camping');
UPDATE public.slider_images SET image_type = 'Generic' WHERE image_type = 'generic';
