
CREATE POLICY "Public read originals" ON storage.objects FOR SELECT USING (bucket_id = 'originals');
CREATE POLICY "Public write originals" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'originals');
CREATE POLICY "Public update originals" ON storage.objects FOR UPDATE USING (bucket_id = 'originals');
CREATE POLICY "Public delete originals" ON storage.objects FOR DELETE USING (bucket_id = 'originals');

CREATE POLICY "Public read compressed" ON storage.objects FOR SELECT USING (bucket_id = 'compressed');
CREATE POLICY "Public write compressed" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'compressed');
CREATE POLICY "Public update compressed" ON storage.objects FOR UPDATE USING (bucket_id = 'compressed');
CREATE POLICY "Public delete compressed" ON storage.objects FOR DELETE USING (bucket_id = 'compressed');
