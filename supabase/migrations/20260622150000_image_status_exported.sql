-- Add "exported" status, set automatically after an image has been downloaded/exported.
ALTER TYPE public.image_status ADD VALUE IF NOT EXISTS 'exported';
