import { useEffect, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { KeyRound, LogOut, Settings, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const router = useRouter();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ full_name: string | null; email: string; avatar_url: string | null } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const [{ data: p }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("full_name, email, avatar_url").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      if (p) setProfile(p);
      if (roles?.some((r) => r.role === "admin")) setIsAdmin(true);
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    await router.invalidate();
    navigate({ to: "/auth", replace: true });
  }

  const name = profile?.full_name || profile?.email || "Account";
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2 text-xs font-bold uppercase text-foreground hover:border-primary/50">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span>{initials || <UserIcon className="h-4 w-4" />}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{profile?.full_name ?? "—"}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{profile?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isAdmin && (
          <>
            <DropdownMenuItem asChild>
              <Link to="/admin" className="flex w-full items-center gap-2">
                <Settings className="h-4 w-4" /> Manage allowlist
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/audit" className="flex w-full items-center gap-2">
                <Settings className="h-4 w-4" /> Change history
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem asChild>
          <Link to="/password" className="flex w-full items-center gap-2">
            <KeyRound className="h-4 w-4" /> Change password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut} className="gap-2">
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
