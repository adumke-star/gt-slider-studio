-- Deleting someone from the allowlist must actually revoke their access.
-- Previously only signups were blocked; registered users kept their
-- user_roles row (and thus editor/admin rights) forever.
--
-- Rollback:
--   DROP FUNCTION public.admin_revoke_user_roles(text);
--   (sync_my_role_from_allowlist: restore previous version from
--    20260710160000_sync_roles_from_allowlist.sql)

-- 1. Immediate revocation when an admin removes an allowlist entry.
CREATE OR REPLACE FUNCTION public.admin_revoke_user_roles(_email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can revoke user roles.' USING ERRCODE = '42501';
  END IF;
  IF lower(_email) = 'a.dumke@global-tickets.com' THEN
    RAISE EXCEPTION 'Cannot revoke the primary administrator.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user_id FROM public.profiles WHERE lower(email) = lower(_email);
  IF v_user_id IS NULL THEN
    RETURN; -- never signed up, nothing to revoke
  END IF;

  DELETE FROM public.user_roles WHERE user_id = v_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_user_roles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_roles(text) TO authenticated;

-- 2. Login sync also revokes: no allowlist entry -> no live role. Covers
--    stale sessions of users who were removed while offline.
CREATE OR REPLACE FUNCTION public.sync_my_role_from_allowlist()
RETURNS public.app_role
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Primary admin is protected by trigger — never touch their row here.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND lower(email) = 'a.dumke@global-tickets.com'
  ) THEN
    RETURN 'admin'::public.app_role;
  END IF;

  SELECT ae.role INTO v_role
  FROM public.profiles p
  JOIN public.allowed_emails ae ON lower(ae.email) = lower(p.email)
  WHERE p.id = v_user_id;

  IF v_role IS NULL THEN
    -- Removed from the allowlist: revoke any remaining live role.
    DELETE FROM public.user_roles WHERE user_id = v_user_id;
    RETURN NULL;
  END IF;

  -- Already the sole live role — skip the write.
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND role = v_role
  ) AND (SELECT count(*) FROM public.user_roles WHERE user_id = v_user_id) = 1 THEN
    RETURN v_role;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, v_role);

  RETURN v_role;
END;
$$;
