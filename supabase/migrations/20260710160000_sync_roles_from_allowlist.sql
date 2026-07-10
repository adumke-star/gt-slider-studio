-- Keep user_roles (live permissions) in sync with allowed_emails (allowlist).
--
-- Drift happened when allowlist roles were changed before admin_set_user_role
-- existed or when sync failed silently — viewers kept editor write access.
--
-- Rollback:
--   DROP FUNCTION public.sync_my_role_from_allowlist();

-- 1. One-time repair for every registered user (skip primary admin — protected trigger).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.id AS user_id, ae.role, lower(p.email) AS email
    FROM public.profiles p
    JOIN public.allowed_emails ae ON lower(ae.email) = lower(p.email)
  LOOP
    IF r.email = 'a.dumke@global-tickets.com' THEN
      CONTINUE;
    END IF;
    DELETE FROM public.user_roles WHERE user_id = r.user_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (r.user_id, r.role);
  END LOOP;
END;
$$;

-- 2. Called on each session start so live role always matches the allowlist.
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

  SELECT ae.role INTO v_role
  FROM public.profiles p
  JOIN public.allowed_emails ae ON lower(ae.email) = lower(p.email)
  WHERE p.id = v_user_id;

  IF v_role IS NULL THEN
    RETURN NULL;
  END IF;

  -- Primary admin is protected by trigger — never touch their row here.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND lower(email) = 'a.dumke@global-tickets.com'
  ) THEN
    RETURN 'admin'::public.app_role;
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
REVOKE EXECUTE ON FUNCTION public.sync_my_role_from_allowlist() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_my_role_from_allowlist() TO authenticated;

-- 3. admin_list_users: expose live role so admins can spot drift in the UI.
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  registered_at timestamptz,
  last_sign_in_at timestamptz,
  last_seen_at timestamptz,
  live_role public.app_role
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.created_at,
    u.last_sign_in_at,
    p.last_seen_at,
    (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = p.id LIMIT 1)
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id;
END;
$$;
