-- Run in Supabase Dashboard → SQL Editor after fresh start (db push).
-- Adds team members to allowed_emails so they can sign up.

INSERT INTO public.allowed_emails (email, role) VALUES
  ('a.dumke@global-tickets.com', 'admin')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;

-- Add more team emails (uncomment and edit):
-- INSERT INTO public.allowed_emails (email, role) VALUES
--   ('colleague@global-tickets.com', 'editor'),
--   ('manager@global-tickets.com', 'viewer')
-- ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;
