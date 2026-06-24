-- Sync slider_images.status from comment state (requires solved enum from prior migration)
CREATE OR REPLACE FUNCTION public.sync_image_status_from_comments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_image_id uuid;
  v_open_count int;
  v_total_count int;
BEGIN
  v_image_id := COALESCE(NEW.image_id, OLD.image_id);

  SELECT COUNT(*)::int INTO v_total_count
  FROM public.comments
  WHERE image_id = v_image_id;

  IF v_total_count = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*)::int INTO v_open_count
  FROM public.comments
  WHERE image_id = v_image_id AND resolved_at IS NULL;

  IF v_open_count > 0 THEN
    UPDATE public.slider_images
    SET status = 'changes'
    WHERE id = v_image_id AND status IS DISTINCT FROM 'changes';
  ELSE
    UPDATE public.slider_images
    SET status = 'solved'
    WHERE id = v_image_id AND status IS DISTINCT FROM 'solved';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_sync_image_status ON public.comments;
CREATE TRIGGER trg_comments_sync_image_status
  AFTER INSERT OR UPDATE OF resolved_at OR DELETE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_image_status_from_comments();

-- Extend race flags with has_solved (DROP required: return type cannot change via CREATE OR REPLACE)
DROP FUNCTION IF EXISTS public.race_status_flags();
CREATE FUNCTION public.race_status_flags()
RETURNS TABLE(race_id uuid, has_changes boolean, has_open_comments boolean, has_solved boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    r.id AS race_id,
    EXISTS (
      SELECT 1 FROM public.slider_images si
      WHERE si.race_id = r.id AND si.status = 'changes'
    ) AS has_changes,
    EXISTS (
      SELECT 1 FROM public.slider_images si
      JOIN public.comments c ON c.image_id = si.id
      WHERE si.race_id = r.id AND c.resolved_at IS NULL
    ) AS has_open_comments,
    EXISTS (
      SELECT 1 FROM public.slider_images si
      WHERE si.race_id = r.id AND si.status = 'solved'
    ) AS has_solved
  FROM public.races r;
$$;

GRANT EXECUTE ON FUNCTION public.race_status_flags() TO authenticated;
