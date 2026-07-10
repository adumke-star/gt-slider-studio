import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  canEditContent,
  isAdminRole,
  pickPrimaryRole,
  type AppRole,
} from "@/lib/roles";

export function useAppRole() {
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (alive) setRole(null);
        return;
      }
      // Live role must match the allowlist — sync before reading user_roles.
      await (supabase.rpc as unknown as (fn: string) => PromiseLike<unknown>)(
        "sync_my_role_from_allowlist",
      );
      const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      if (!error && (roles ?? []).length === 0) {
        // Removed from the allowlist: end the stale session.
        await supabase.auth.signOut();
        window.location.href = "/auth";
        return;
      }
      if (alive) setRole(pickPrimaryRole(roles ?? []));
    })();
    return () => { alive = false; };
  }, []);

  return {
    role,
    loading: role === null,
    isAdmin: role != null && isAdminRole(role),
    canEdit: role != null && canEditContent(role),
  };
}
