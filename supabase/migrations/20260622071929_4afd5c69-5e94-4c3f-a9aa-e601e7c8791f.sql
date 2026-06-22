
-- Drop the SECURITY DEFINER view (linter ERROR 1)
DROP VIEW IF EXISTS public.profiles_public;

-- Replace with a SECURITY DEFINER function that exposes only safe columns
CREATE OR REPLACE FUNCTION public.get_public_profiles()
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name, avatar_url FROM public.profiles
$$;

-- Lock down EXECUTE on SECURITY DEFINER helpers: revoke public, grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.can_edit_content(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_public_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_content(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profiles() TO authenticated;
