import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2, UserPlus, ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Allowlist — Slider Studio" }] }),
  component: AdminPage,
});

type Allowed = { id: string; email: string; role: "admin" | "member"; created_at: string };

function AdminPage() {
  const [rows, setRows] = useState<Allowed[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("allowed_emails").select("*").order("created_at", { ascending: false });
    setRows((data ?? []) as Allowed[]);
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      load();
    })();
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

  async function remove(id: string) {
    if (!confirm("Really delete this entry? The user won't be able to sign in again (existing sessions stay active).")) return;
    await supabase.from("allowed_emails").delete().eq("id", id);
    load();
  }

  async function toggleRole(row: Allowed) {
    const next = row.role === "admin" ? "member" : "admin";
    await supabase.from("allowed_emails").update({ role: next }).eq("id", row.id);
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
              placeholder="name@global-tickets.com"
              className="min-w-[260px] flex-1"
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "member")}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <Button onClick={add} className="gap-1.5">
              <UserPlus className="h-4 w-4" /> Add
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </section>

        <section className="rounded-lg border border-border bg-surface-2">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2">Email</th><th className="px-4 py-2">Role</th><th className="px-4 py-2 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No entries yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 last:border-b-0">
                  <td className="px-4 py-2">{r.email}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${r.role === "admin" ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-muted text-muted-foreground"}`}>
                      {r.role}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => toggleRole(r)} title="Toggle role" className="mr-1 inline-flex items-center rounded p-1.5 text-muted-foreground hover:bg-background hover:text-primary">
                      {r.role === "admin" ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                    </button>
                    <button onClick={() => remove(r.id)} title="Delete" className="inline-flex items-center rounded p-1.5 text-muted-foreground hover:bg-background hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
