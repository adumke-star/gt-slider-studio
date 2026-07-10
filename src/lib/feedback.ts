import { supabase } from "@/integrations/supabase/client";
import { isSuperuserEmail } from "@/lib/roles";

/**
 * Confidential jury feedback (see migration 20260710101500_jury_feedback).
 * Only jury members and the primary admin can read or write feedback — RLS
 * enforces this server-side, the helpers here only drive the UI.
 *
 * The feedback/jury_members tables are not part of the generated Supabase
 * types, so all access goes through a loosely typed client view.
 */

export type FeedbackRow = {
  id: string;
  image_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type JuryMember = {
  user_id: string;
  created_at: string;
  email: string;
  full_name: string | null;
};

type Row = Record<string, unknown>;
type Err = { message: string } | null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

// Cached per user id, not per page load: signing out and back in as someone
// else within the same tab must not reuse the previous user's result.
let accessCache: { userId: string; promise: Promise<boolean> } | null = null;

/** Whether the signed-in user may see/write feedback. */
export async function fetchFeedbackAccess(): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return false;
  const userId = u.user.id;
  const email = u.user.email ?? "";
  if (accessCache?.userId !== userId) {
    const promise = (async () => {
      if (isSuperuserEmail(email)) return true;
      // RLS lets everyone read their own jury row only.
      const { data, error } = await db.from("jury_members").select("user_id").eq("user_id", userId);
      if (error) {
        // Transient (e.g. schema cache not reloaded yet) — retry on next call.
        accessCache = null;
        return false;
      }
      return ((data as Row[] | null) ?? []).length > 0;
    })();
    accessCache = { userId, promise };
  }
  return accessCache.promise;
}

export async function feedbackCount(imageId: string): Promise<number> {
  const { count } = await db
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("image_id", imageId);
  return (count as number | null) ?? 0;
}

export async function listFeedback(imageId: string): Promise<FeedbackRow[]> {
  const { data, error } = await db
    .from("feedback")
    .select("*")
    .eq("image_id", imageId)
    .order("created_at");
  if (error) throw new Error((error as NonNullable<Err>).message);
  return ((data as FeedbackRow[] | null) ?? []);
}

export async function addFeedback(imageId: string, body: string): Promise<FeedbackRow> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in.");
  const { data, error } = await db
    .from("feedback")
    .insert({ image_id: imageId, author_id: u.user.id, body })
    .select()
    .single();
  if (error) throw new Error((error as NonNullable<Err>).message);
  return data as FeedbackRow;
}

export async function updateFeedback(id: string, body: string): Promise<void> {
  const { error } = await db.from("feedback").update({ body }).eq("id", id);
  if (error) throw new Error((error as NonNullable<Err>).message);
}

export async function deleteFeedback(id: string): Promise<void> {
  const { error } = await db.from("feedback").delete().eq("id", id);
  if (error) throw new Error((error as NonNullable<Err>).message);
}

/* ---- Jury administration (primary admin only, RLS-gated) ---- */

export async function listJuryMembers(): Promise<JuryMember[]> {
  const { data, error } = await db
    .from("jury_members")
    .select("user_id, created_at")
    .order("created_at");
  if (error) throw new Error((error as NonNullable<Err>).message);
  const rows = ((data as { user_id: string; created_at: string }[] | null) ?? []);
  if (rows.length === 0) return [];
  const { data: profiles } = await db
    .from("profiles")
    .select("id, email, full_name")
    .in("id", rows.map((r) => r.user_id));
  const byId = new Map(
    (((profiles as { id: string; email: string; full_name: string | null }[] | null) ?? []))
      .map((p) => [p.id, p]),
  );
  return rows.map((r) => ({
    user_id: r.user_id,
    created_at: r.created_at,
    email: byId.get(r.user_id)?.email ?? "—",
    full_name: byId.get(r.user_id)?.full_name ?? null,
  }));
}

/** Returns null on success, an error message otherwise. */
export async function addJuryMemberByEmail(email: string): Promise<string | null> {
  const e = email.trim().toLowerCase();
  if (!e || !e.includes("@")) return "Please enter a valid email address.";
  const { data: prof } = await db
    .from("profiles")
    .select("id")
    .ilike("email", e)
    .maybeSingle();
  if (!prof) return "No registered user with this email — they must sign in once first.";
  const { data: u } = await supabase.auth.getUser();
  const { error } = await db
    .from("jury_members")
    .insert({ user_id: (prof as { id: string }).id, added_by: u.user?.id ?? null });
  if (error) {
    const msg = (error as NonNullable<Err>).message;
    return msg.includes("duplicate") ? "This user is already a jury member." : msg;
  }
  return null;
}

export async function removeJuryMember(userId: string): Promise<string | null> {
  const { error } = await db.from("jury_members").delete().eq("user_id", userId);
  return error ? (error as NonNullable<Err>).message : null;
}
