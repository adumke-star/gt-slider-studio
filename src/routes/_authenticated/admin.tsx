import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Star, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  INVITE_ROLES,
  ROLE_LABELS,
  isSuperuserEmail,
  normalizeRole,
  type AppRole,
} from "@/lib/roles";
import {
  addJuryMemberByEmail,
  listJuryMembers,
  removeJuryMember,
  type JuryMember,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Allowlist — Slider Studio" }] }),
  component: AdminPage,
});

type Allowed = { id: string; email: string; role: string; created_at: string };

type UserActivity = {
  user_id: string;
  email: string;
  full_name: string | null;
  registered_at: string | null;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  live_role: string | null;
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function roleBadgeClass(role: AppRole) {
  if (role === "admin") return "border-primary/40 bg-primary/15 text-primary";
  if (role === "editor") return "border-amber-500/40 bg-amber-500/15 text-amber-600";
  return "border-border bg-muted text-muted-foreground";
}

/** Sync the live role of an already-registered user (admin-gated in the DB). */
async function syncUserRoleForEmail(email: string, role: AppRole): Promise<string | null> {
  if (isSuperuserEmail(email)) return null;
  const { error } = await supabase.rpc("admin_set_user_role", { _email: email, _role: role });
  return error?.message ?? null;
}

function AdminPage() {
  const [rows, setRows] = useState<Allowed[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("viewer");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityByEmail, setActivityByEmail] = useState<Map<string, UserActivity>>(new Map());
  async function load() {
    const { data } = await supabase.from("allowed_emails").select("*").order("created_at", { ascending: false });
    setRows((data ?? []) as Allowed[]);
    // Registration/login/activity info — admin-gated RPC, newer than the generated types.
    const { data: activity } = await (supabase.rpc as unknown as (
      fn: string,
    ) => Promise<{ data: UserActivity[] | null }>)("admin_list_users");
    setActivityByEmail(new Map((activity ?? []).map((a) => [a.email.toLowerCase(), a])));
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setIsPrimary(isSuperuserEmail(u.user.email ?? ""));
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      load();
    })();
    // Keep the online indicators fresh while the page stays open.
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function add() {
    setError(null);
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    const { error: err } = await supabase.from("allowed_emails").insert({ email: e, role });
    if (err) setError(err.message);
    else {
      setEmail("");
      load();
    }
  }

  async function remove(id: string, rowEmail: string) {
    if (isSuperuserEmail(rowEmail)) {
      setError("The primary administrator cannot be removed from the allowlist.");
      return;
    }
    if (!confirm("Really delete this entry? The user won't be able to sign in again (existing sessions stay active).")) return;
    await supabase.from("allowed_emails").delete().eq("id", id);
    load();
  }

  async function changeRole(row: Allowed, next: AppRole) {
    if (isSuperuserEmail(row.email) && next !== "admin") {
      setError("The primary administrator must remain an admin.");
      return;
    }
    const { error: err } = await supabase.from("allowed_emails").update({ role: next }).eq("id", row.id);
    if (err) {
      setError(err.message);
      return;
    }
    const syncError = await syncUserRoleForEmail(row.email, next);
    if (syncError) setError(`Allowlist updated, but the active role could not be changed: ${syncError}`);
    load();
  }

  if (isAdmin === false) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground">
        <div>
          <h1 className="font-display text-2xl uppercase">No access</h1>
          <p className="mt-2 text-sm text-muted-foreground">This page is for admins only.</p>
          <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">← Back to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface-2/95">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <h1 className="ml-auto font-display text-lg font-black uppercase">Allowlist</h1>
          <Link to="/backup" className="text-sm text-muted-foreground hover:text-foreground">Backup →</Link>
          <Link to="/audit" className="text-sm text-muted-foreground hover:text-foreground">History →</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-6">
        <section className="rounded-lg border border-border bg-surface-2 p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Invite team member</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="min-w-[260px] flex-1"
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <Button onClick={add} className="gap-1.5">
              <UserPlus className="h-4 w-4" /> Add
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Viewer — read &amp; comment only · Editor — manage races &amp; images · Admin — plus allowlist &amp; history
          </p>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </section>

        <section className="rounded-lg border border-border bg-surface-2">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Account</th>
                <th className="px-4 py-2">Last login</th>
                <th className="px-4 py-2">Activity</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No entries yet.</td></tr>}
              {rows.map((r) => {
                const normalized = normalizeRole(r.role);
                const locked = isSuperuserEmail(r.email);
                const activity = activityByEmail.get(r.email.toLowerCase());
                const liveRole = activity?.live_role ? normalizeRole(activity.live_role) : null;
                const roleDrift = liveRole != null && liveRole !== normalized;
                const online =
                  !!activity?.last_seen_at &&
                  Date.now() - new Date(activity.last_seen_at).getTime() < ONLINE_WINDOW_MS;
                return (
                  <tr key={r.id} className="border-b border-border/50 last:border-b-0">
                    <td className="px-4 py-2">
                      {r.email}
                      {locked && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          (primary admin)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {locked ? (
                        <span className={cn(
                          "inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                          roleBadgeClass("admin"),
                        )}>
                          {ROLE_LABELS.admin}
                        </span>
                      ) : (
                        <select
                          value={normalized}
                          onChange={(e) => changeRole(r, e.target.value as AppRole)}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            roleBadgeClass(normalized),
                          )}
                        >
                          {INVITE_ROLES.map((opt) => (
                            <option key={opt} value={opt}>{ROLE_LABELS[opt]}</option>
                          ))}
                        </select>
                      )}
                      {roleDrift && (
                        <div className="mt-1 text-[10px] text-destructive" title="Live permissions differ from allowlist — user must reload the app">
                          Live: {ROLE_LABELS[liveRole!]} — reload app to apply
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground" title={activity?.full_name ?? undefined}>
                      {activity?.registered_at ? shortDate(activity.registered_at) : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {activity?.last_sign_in_at ? relativeTime(activity.last_sign_in_at) : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {online ? (
                        <span className="inline-flex items-center gap-1.5 text-[var(--status-live)]">
                          <span className="h-2 w-2 rounded-full bg-[var(--status-live)]" /> online
                        </span>
                      ) : activity?.last_seen_at ? (
                        <span className="text-muted-foreground">{relativeTime(activity.last_seen_at)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!locked && (
                        <button onClick={() => remove(r.id, r.email)} title="Delete" className="inline-flex items-center rounded p-1.5 text-muted-foreground hover:bg-background hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {isPrimary && <JurySection />}
      </main>
    </div>
  );
}

/**
 * Jury administration — only rendered for the primary admin; the DB policies
 * on jury_members enforce the same restriction server-side.
 */
function JurySection() {
  const [members, setMembers] = useState<JuryMember[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setMembers(await listJuryMembers());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); }, []);

  async function add() {
    setError(null);
    setBusy(true);
    try {
      const err = await addJuryMemberByEmail(email);
      if (err) setError(err);
      else {
        setEmail("");
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: JuryMember) {
    if (!confirm(`Remove ${m.full_name || m.email} from the jury? They will lose access to all feedback.`)) return;
    const err = await removeJuryMember(m.user_id);
    if (err) setError(err);
    else load();
  }

  return (
    <section className="rounded-lg border border-amber-500/30 bg-surface-2 p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        <Star className="h-4 w-4 text-amber-400" /> Jury
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Jury members can see and write the confidential slot feedback — independent of their normal role.
        Only you (primary admin) can manage this list and see it.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com (must have signed in once)"
          className="min-w-[260px] flex-1"
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <Button onClick={add} disabled={busy} className="gap-1.5">
          <UserPlus className="h-4 w-4" /> Add to jury
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <ul className="mt-3 divide-y divide-border/50 rounded border border-border">
        {members.length === 0 && (
          <li className="px-4 py-4 text-center text-xs text-muted-foreground">
            No jury members yet — currently only you can see feedback.
          </li>
        )}
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-2 px-4 py-2 text-sm">
            <span className="min-w-0 truncate">{m.full_name || m.email}</span>
            {m.full_name && <span className="truncate text-xs text-muted-foreground">{m.email}</span>}
            <button
              onClick={() => remove(m)}
              title="Remove from jury"
              className="ml-auto inline-flex items-center rounded p-1.5 text-muted-foreground hover:bg-background hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
