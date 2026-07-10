import { useEffect } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_MS = 2 * 60 * 1000;

/**
 * Activity heartbeat: stamps profiles.last_seen_at while a tab is open so
 * admins can see who is currently active (see admin_list_users migration).
 */
function useActivityHeartbeat() {
  useEffect(() => {
    let stopped = false;

    async function beat() {
      if (stopped || document.visibilityState !== "visible") return;
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      // last_seen_at is newer than the generated types.
      await (supabase.from("profiles") as unknown as {
        update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => PromiseLike<unknown> };
      }).update({ last_seen_at: new Date().toISOString() }).eq("id", data.user.id);
    }

    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}

function AuthenticatedLayout() {
  useActivityHeartbeat();
  return <Outlet />;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});
