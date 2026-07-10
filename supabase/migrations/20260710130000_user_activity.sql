-- Admin visibility of user activity: who registered, last login, last activity.
--
-- Additive only. Rollback:
--   DROP FUNCTION public.admin_list_users();
--   ALTER TABLE public.profiles DROP COLUMN last_seen_at;

-- Heartbeat timestamp, updated by the app every few minutes while a tab is
-- open. Users can already update their own profile row (existing policy).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Admin-only listing joining profiles with auth login metadata.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  registered_at timestamptz,
  last_sign_in_at timestamptz,
  last_seen_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.created_at, u.last_sign_in_at, p.last_seen_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
