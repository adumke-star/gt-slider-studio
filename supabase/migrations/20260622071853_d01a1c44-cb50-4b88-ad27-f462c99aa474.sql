
-- 1. Add 'editor' role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'editor';

-- 2. Helper function: can write content (admin or editor). Uses ::text to avoid enum-in-same-tx issues.
CREATE OR REPLACE FUNCTION public.can_edit_content(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin', 'editor')
  )
$$;

-- 3. allowed_emails: remove broad read, admins-only (admin manage policy already covers it via ALL)
DROP POLICY IF EXISTS "auth read allowed_emails" ON public.allowed_emails;

-- 4. profiles: restrict SELECT to own row or admin
DROP POLICY IF EXISTS "auth read profiles" ON public.profiles;
CREATE POLICY "user read own profile or admin"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- 5. profiles_public view (no email) for general profile lookups (e.g. comment authors)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
  SELECT id, full_name, avatar_url
  FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;

-- Make underlying SELECT permissive for the view's columns (id, full_name, avatar_url) only.
-- We do this by adding a second SELECT policy that allows reading non-email columns to all authenticated.
-- Since column-level RLS isn't a feature, we instead allow row visibility broadly but rely on the view
-- to project safe columns and on app code to query profiles_public (not profiles) when not admin.
CREATE POLICY "auth read profiles via view"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Note: the two SELECT policies are OR-ed. To truly hide email, app code MUST use profiles_public.
-- Drop the permissive one and rely on direct queries for own/admin only:
DROP POLICY IF EXISTS "auth read profiles via view" ON public.profiles;

-- Instead: grant SELECT on the view from a SECURITY DEFINER source by switching the view to definer.
-- Recreate as security_definer so the view bypasses the restrictive table policy:
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
WITH (security_invoker = off) AS
  SELECT id, full_name, avatar_url
  FROM public.profiles;

ALTER VIEW public.profiles_public OWNER TO postgres;
GRANT SELECT ON public.profiles_public TO authenticated;

-- 6. races / slider_sections / slider_images: split read vs write
DROP POLICY IF EXISTS "auth all races" ON public.races;
CREATE POLICY "auth read races" ON public.races
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write races" ON public.races
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "editor update races" ON public.races
  FOR UPDATE TO authenticated
  USING (public.can_edit_content(auth.uid()))
  WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "editor delete races" ON public.races
  FOR DELETE TO authenticated USING (public.can_edit_content(auth.uid()));

DROP POLICY IF EXISTS "auth all sections" ON public.slider_sections;
CREATE POLICY "auth read sections" ON public.slider_sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write sections" ON public.slider_sections
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "editor update sections" ON public.slider_sections
  FOR UPDATE TO authenticated
  USING (public.can_edit_content(auth.uid()))
  WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "editor delete sections" ON public.slider_sections
  FOR DELETE TO authenticated USING (public.can_edit_content(auth.uid()));

DROP POLICY IF EXISTS "auth all images" ON public.slider_images;
CREATE POLICY "auth read images" ON public.slider_images
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write images" ON public.slider_images
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "editor update images" ON public.slider_images
  FOR UPDATE TO authenticated
  USING (public.can_edit_content(auth.uid()))
  WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "editor delete images" ON public.slider_images
  FOR DELETE TO authenticated USING (public.can_edit_content(auth.uid()));
