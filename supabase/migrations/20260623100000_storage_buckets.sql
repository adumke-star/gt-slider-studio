-- Storage buckets referenced by RLS policies (must exist before uploads work).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('originals', 'originals', false, NULL, NULL),
  ('compressed', 'compressed', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
