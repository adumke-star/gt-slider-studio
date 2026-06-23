-- Apply viewer role (must run in a separate migration after enum value is committed).
UPDATE public.allowed_emails SET role = 'viewer' WHERE role = 'member';
UPDATE public.user_roles SET role = 'viewer' WHERE role = 'member';

ALTER TABLE public.allowed_emails ALTER COLUMN role SET DEFAULT 'viewer';

-- Storage writes: editors and admins only (match races/images RLS).
DROP POLICY IF EXISTS "Auth write compressed" ON storage.objects;
DROP POLICY IF EXISTS "Auth write originals" ON storage.objects;
DROP POLICY IF EXISTS "Auth update compressed" ON storage.objects;
DROP POLICY IF EXISTS "Auth update originals" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete compressed" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete originals" ON storage.objects;

CREATE POLICY "editor write compressed" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'compressed' AND public.can_edit_content(auth.uid()));

CREATE POLICY "editor write originals" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'originals' AND public.can_edit_content(auth.uid()));

CREATE POLICY "editor update compressed" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'compressed' AND public.can_edit_content(auth.uid()))
  WITH CHECK (bucket_id = 'compressed' AND public.can_edit_content(auth.uid()));

CREATE POLICY "editor update originals" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'originals' AND public.can_edit_content(auth.uid()))
  WITH CHECK (bucket_id = 'originals' AND public.can_edit_content(auth.uid()));

CREATE POLICY "editor delete compressed" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'compressed' AND public.can_edit_content(auth.uid()));

CREATE POLICY "editor delete originals" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'originals' AND public.can_edit_content(auth.uid()));
