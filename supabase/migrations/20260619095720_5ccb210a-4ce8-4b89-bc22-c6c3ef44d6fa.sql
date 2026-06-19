
CREATE TABLE public.image_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid,
  race_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_created ON public.image_audit_log (created_at DESC);
CREATE INDEX idx_audit_image ON public.image_audit_log (image_id);
CREATE INDEX idx_audit_user ON public.image_audit_log (user_id);

GRANT SELECT ON public.image_audit_log TO authenticated;
GRANT ALL ON public.image_audit_log TO service_role;

ALTER TABLE public.image_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read audit log" ON public.image_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_image_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_old jsonb;
  v_new jsonb;
  v_image_id uuid;
  v_race_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_image_id := NEW.id;
    v_race_id := NEW.race_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Determine semantic action
    IF NEW.original_path IS DISTINCT FROM OLD.original_path AND NEW.original_path IS NOT NULL THEN
      v_action := CASE WHEN OLD.original_path IS NULL THEN 'uploaded' ELSE 'replaced' END;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      v_action := 'status_changed';
    ELSIF NEW.title IS DISTINCT FROM OLD.title THEN
      v_action := 'renamed';
    ELSIF NEW.position IS DISTINCT FROM OLD.position OR NEW.section_id IS DISTINCT FROM OLD.section_id OR NEW.area IS DISTINCT FROM OLD.area THEN
      v_action := 'moved';
    ELSE
      v_action := 'updated';
    END IF;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_image_id := NEW.id;
    v_race_id := NEW.race_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_image_id := OLD.id;
    v_race_id := OLD.race_id;
  END IF;

  INSERT INTO public.image_audit_log (image_id, race_id, user_id, action, old_values, new_values)
  VALUES (v_image_id, v_race_id, auth.uid(), v_action, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_slider_images_audit
AFTER INSERT OR UPDATE OR DELETE ON public.slider_images
FOR EACH ROW EXECUTE FUNCTION public.log_image_change();
