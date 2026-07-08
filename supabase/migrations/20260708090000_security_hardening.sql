-- Security hardening (defense in depth).
-- 1. Remove legacy anon table grants — the app is login-only, anon must not
--    hold table privileges even though no RLS policy currently matches it.
-- 2. Rule checks: writes require editor/admin (UI already enforces this).
-- 3. Storage buckets: size limit + raster-image MIME whitelist.
-- 4. admin_set_user_role(): the only path that syncs a user's live role.
--    Replaces direct client writes to user_roles (which RLS silently blocked).

-- 1. Anon table grants -------------------------------------------------------
-- The app is login-only: anon never queries PostgREST (only GoTrue auth).
-- Revoke the Supabase default grants on all current and future tables.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- 2. Rule checks: read for the team, write for editors/admins ----------------
DROP POLICY IF EXISTS "auth manage rule checks" ON public.race_rule_checks;
DROP POLICY IF EXISTS "auth read rule checks" ON public.race_rule_checks;
DROP POLICY IF EXISTS "editor insert rule checks" ON public.race_rule_checks;
DROP POLICY IF EXISTS "editor update rule checks" ON public.race_rule_checks;
DROP POLICY IF EXISTS "editor delete rule checks" ON public.race_rule_checks;

CREATE POLICY "auth read rule checks" ON public.race_rule_checks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor insert rule checks" ON public.race_rule_checks
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "editor update rule checks" ON public.race_rule_checks
  FOR UPDATE TO authenticated
  USING (public.can_edit_content(auth.uid()))
  WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "editor delete rule checks" ON public.race_rule_checks
  FOR DELETE TO authenticated
  USING (public.can_edit_content(auth.uid()));

-- 3. Bucket limits: 50 MB per file, raster images only -----------------------
-- Matches every format the app can produce (upload resize outputs JPEG,
-- compression outputs webp/avif/jpeg/png, backups restore the same set).
UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'
    ]
WHERE id IN ('originals', 'compressed');

-- 4. Admin-only role sync ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_email text, _role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change user roles.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user_id FROM public.profiles WHERE lower(email) = lower(_email);
  IF v_user_id IS NULL THEN
    RETURN; -- not signed up yet; role applies at signup via handle_new_user
  END IF;

  -- protect_superuser_user_roles triggers still fire inside this function.
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, _role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(text, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(text, public.app_role) TO authenticated;
