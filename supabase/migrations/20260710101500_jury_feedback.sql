-- Confidential jury feedback on slots.
--
-- Feedback is status-neutral (no slider_images.status trigger) and visible
-- ONLY to jury members and the primary admin. Regular admins/editors/viewers
-- see nothing — not even that feedback exists (RLS returns zero rows).
--
-- This migration is purely ADDITIVE: no existing table, policy or function is
-- modified. Full rollback:
--   DROP FUNCTION public.restore_feedback(jsonb);
--   DROP FUNCTION public.export_feedback(uuid);
--   DROP TABLE public.feedback;
--   DROP FUNCTION public.can_access_feedback(uuid);
--   DROP TABLE public.jury_members;
--   DROP FUNCTION public.is_primary_admin(uuid);

-- 1. Primary admin check (same hardcoded email as the protect_superuser migration).
CREATE OR REPLACE FUNCTION public.is_primary_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND lower(email) = 'a.dumke@global-tickets.com'
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_primary_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_primary_admin(uuid) TO authenticated;

-- 2. Jury membership — additive status on top of the normal role, managed by
--    the primary admin only. Users may read their own row (drives the UI).
CREATE TABLE public.jury_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.jury_members TO authenticated;
GRANT ALL ON public.jury_members TO service_role;
ALTER TABLE public.jury_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own row or primary admin reads jury" ON public.jury_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_primary_admin(auth.uid()));
CREATE POLICY "primary admin adds jury" ON public.jury_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_primary_admin(auth.uid()));
CREATE POLICY "primary admin removes jury" ON public.jury_members
  FOR DELETE TO authenticated
  USING (public.is_primary_admin(auth.uid()));

-- 3. Feedback access = jury member OR primary admin.
CREATE OR REPLACE FUNCTION public.can_access_feedback(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.jury_members WHERE user_id = _user_id)
      OR public.is_primary_admin(_user_id)
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_feedback(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_feedback(uuid) TO authenticated;

-- 4. Feedback table. author_id is nullable with ON DELETE SET NULL so feedback
--    survives account deletion ("former member").
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES public.slider_images(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_image_id_idx ON public.feedback(image_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jury reads feedback" ON public.feedback
  FOR SELECT TO authenticated
  USING (public.can_access_feedback(auth.uid()));
CREATE POLICY "jury writes own feedback" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_access_feedback(auth.uid()));
CREATE POLICY "author edits own feedback" ON public.feedback
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "author or primary admin deletes feedback" ON public.feedback
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_primary_admin(auth.uid()));

CREATE TRIGGER feedback_updated_at BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Backup export. SECURITY DEFINER so RLS cannot silently drop rows, but
--    gated: non-eligible callers get an empty set, so their backups still work
--    (just without confidential feedback in the ZIP).
CREATE OR REPLACE FUNCTION public.export_feedback(_race_id uuid DEFAULT NULL)
RETURNS SETOF public.feedback
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT f.*
  FROM public.feedback f
  JOIN public.slider_images si ON si.id = f.image_id
  WHERE public.can_access_feedback(auth.uid())
    AND (_race_id IS NULL OR si.race_id = _race_id)
  ORDER BY f.created_at
$$;
REVOKE EXECUTE ON FUNCTION public.export_feedback(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_feedback(uuid) TO authenticated;

-- 6. Backup restore. SECURITY DEFINER so original ids/authors/timestamps are
--    kept even though the restorer is not the author. Jury/primary admin only.
--    Authors that no longer exist are kept as NULL; rows whose image is gone
--    or that already exist are counted as skipped.
CREATE OR REPLACE FUNCTION public.restore_feedback(_rows jsonb)
RETURNS TABLE (restored int, skipped int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_restored int := 0;
  v_skipped int := 0;
  v_author uuid;
BEGIN
  IF NOT public.can_access_feedback(auth.uid()) THEN
    RAISE EXCEPTION 'Only jury members or the primary admin can restore feedback.'
      USING ERRCODE = '42501';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) LOOP
    BEGIN
      v_author := NULLIF(r->>'author_id', '')::uuid;
      IF v_author IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_author) THEN
        v_author := NULL;
      END IF;

      INSERT INTO public.feedback (id, image_id, author_id, body, created_at, updated_at)
      VALUES (
        COALESCE(NULLIF(r->>'id', '')::uuid, gen_random_uuid()),
        (r->>'image_id')::uuid,
        v_author,
        r->>'body',
        COALESCE(NULLIF(r->>'created_at', '')::timestamptz, now()),
        COALESCE(NULLIF(r->>'updated_at', '')::timestamptz, now())
      )
      ON CONFLICT (id) DO NOTHING;

      IF FOUND THEN
        v_restored := v_restored + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_restored, v_skipped;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.restore_feedback(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_feedback(jsonb) TO authenticated;
