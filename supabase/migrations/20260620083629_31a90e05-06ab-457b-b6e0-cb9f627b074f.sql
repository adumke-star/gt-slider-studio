CREATE OR REPLACE FUNCTION public.race_status_flags()
RETURNS TABLE(race_id uuid, has_changes boolean, has_open_comments boolean)
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
    ) AS has_open_comments
  FROM public.races r;
$$;

GRANT EXECUTE ON FUNCTION public.race_status_flags() TO authenticated;