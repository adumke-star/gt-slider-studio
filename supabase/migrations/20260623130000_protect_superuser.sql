-- Protect primary administrator from role downgrade or allowlist removal.

CREATE OR REPLACE FUNCTION public.protect_superuser_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(OLD.email) <> 'a.dumke@global-tickets.com' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cannot remove the primary administrator from the allowlist.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role::text <> 'admin' THEN
    RAISE EXCEPTION 'Cannot change the role of the primary administrator.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_superuser_allowed_emails
  BEFORE UPDATE OR DELETE ON public.allowed_emails
  FOR EACH ROW EXECUTE FUNCTION public.protect_superuser_allowlist();

CREATE OR REPLACE FUNCTION public.protect_superuser_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT lower(email) INTO v_email FROM public.profiles WHERE id = COALESCE(NEW.user_id, OLD.user_id);
  IF v_email IS DISTINCT FROM 'a.dumke@global-tickets.com' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' AND OLD.role::text = 'admin' THEN
    RAISE EXCEPTION 'Cannot remove admin role from the primary administrator.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role::text <> 'admin' THEN
    RAISE EXCEPTION 'Cannot change the role of the primary administrator.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.role::text <> 'admin' THEN
    RAISE EXCEPTION 'Primary administrator must have the admin role.'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER protect_superuser_user_roles
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_superuser_user_role();

-- Ensure allowlist row stays admin (idempotent).
INSERT INTO public.allowed_emails (email, role)
VALUES ('a.dumke@global-tickets.com', 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin';
