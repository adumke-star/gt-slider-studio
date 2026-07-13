-- Solve/Reopen must work for every signed-in user (viewers included), while
-- the comment text itself stays editable only by its author.
--
-- The existing "author update own comment" RLS policy blocks non-authors from
-- toggling resolved_at. Instead of loosening that policy (which would also let
-- anyone rewrite the body), expose a narrow SECURITY DEFINER RPC that only
-- touches resolved_at / resolved_by.
--
-- Rollback:
--   DROP FUNCTION public.set_comment_resolved(uuid, boolean);

CREATE OR REPLACE FUNCTION public.set_comment_resolved(_comment_id uuid, _resolved boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.comments
  SET resolved_at = CASE WHEN _resolved THEN now() ELSE NULL END,
      resolved_by = CASE WHEN _resolved THEN v_user_id ELSE NULL END
  WHERE id = _comment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comment not found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_comment_resolved(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_comment_resolved(uuid, boolean) TO authenticated;
