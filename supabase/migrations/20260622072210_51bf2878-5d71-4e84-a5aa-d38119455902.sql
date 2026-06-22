
DROP POLICY IF EXISTS "Public read compressed" ON storage.objects;
DROP POLICY IF EXISTS "Public read originals" ON storage.objects;
DROP POLICY IF EXISTS "Public write compressed" ON storage.objects;
DROP POLICY IF EXISTS "Public write originals" ON storage.objects;
DROP POLICY IF EXISTS "Public update compressed" ON storage.objects;
DROP POLICY IF EXISTS "Public update originals" ON storage.objects;
DROP POLICY IF EXISTS "Public delete compressed" ON storage.objects;
DROP POLICY IF EXISTS "Public delete originals" ON storage.objects;

CREATE POLICY "Auth read compressed" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'compressed');
CREATE POLICY "Auth read originals" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'originals');

CREATE POLICY "Auth write compressed" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'compressed');
CREATE POLICY "Auth write originals" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'originals');

CREATE POLICY "Auth update compressed" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'compressed') WITH CHECK (bucket_id = 'compressed');
CREATE POLICY "Auth update originals" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'originals') WITH CHECK (bucket_id = 'originals');

CREATE POLICY "Auth delete compressed" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'compressed');
CREATE POLICY "Auth delete originals" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'originals');
