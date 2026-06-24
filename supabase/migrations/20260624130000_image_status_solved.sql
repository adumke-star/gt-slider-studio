-- Add solved status enum value (must be committed before use in follow-up migration)
ALTER TYPE public.image_status ADD VALUE IF NOT EXISTS 'solved';
