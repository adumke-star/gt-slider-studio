import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Verlauf — Slider Studio" }] }),
  component: AuditPage,
});

type LogRow = {
  id: string;
  image_id: string | null;
  race_id: string | null;
  user_id: string | null;
  action: string;
  old_values: any;
  new_values: any;
  created_at: string;
};

type Profile = { id: string; email: string; full_name: string | null; avatar_url: string | null };
type Race = { id: string; name: string };

const ACTION_LABEL: Record<string, string> = {
  created: "angelegt",
  uploaded: "hochgeladen",
  replaced: "ersetzt",
  renamed: "umbenannt",
  moved: "verschoben",
  status_changed: "Status geändert",
  updated: "geändert",
  deleted: "gelöscht",
};

const ACTION_COLOR: Record<string, string> = {
  created: "border-border bg-muted text-muted-foreground",
  uploaded: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  replaced: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  renamed: "border-sky-500/40 bg-sky-500/15 text-sky-300",
  moved: "border-violet-500/40 bg-violet-500/15 text-violet-300",
  status_changed: "border-blue-500/40 bg-blue-500/15 text-blue-300",
  updated: "border-border bg-muted text-muted-foreground",
  deleted: "border-destructive/40 bg-destructive/15 text-destructive",
};

function AuditPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [races, setRaces] = useState<Record<string, Race>>({});
  const [userFilter, setUserFilter] = useState<string>("");
  const [raceFilter, setRaceFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      const admin = !!roles?.some((r) => r.role === "admin");
      setIsAdmin(admin);
      if (!admin) {
        setLoading(false);
        return;
      }
      const [{ data: logs }, { data: profs }, { data: rcs }] = await Promise.all([
        (supabase as any).from("image_audit_log").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("profiles").select("id,email,full_name,avatar_url"),
        supabase.from("races").select("id,name"),
      ]);
      setRows((logs ?? []) as LogRow[]);
      setProfiles(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p])));
      setRaces(Object.fromEntries((rcs ?? []).map((r: any) => [r.id, r])));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!userFilter || r.user_id === userFilter) &&
          (!raceFilter || r.race_id === raceFilter) &&
          (!actionFilter || r.action === actionFilter),
      ),
    [rows, userFilter, raceFilter, actionFilter],
  );

  const uniqueUsers = useMemo(() => {
    const ids = new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]);
    return [...ids].map((id) => profiles[id]).filter(Boolean);
  }, [rows, profiles]);

  const uniqueRaces = useMemo(() => {
    const ids = new Set(rows.map((r) => r.race_id).filter(Boolean) as string[]);
    return [...ids].map((id) => races[id]).filter(Boolean);
  }, [rows, races]);

  if (isAdmin === false) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground">
        <div>
          <h1 className="font-display text-2xl uppercase">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-muted-foreground">Diese Seite ist nur für Admins.</p>
          <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">← Zurück zum Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface-2/95">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <h1 className="ml-auto font-display text-lg font-black uppercase">Änderungs-Verlauf</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-6 py-6">
        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 p-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            <option value="">Alle Nutzer</option>
            {uniqueUsers.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
          <select value={raceFilter} onChange={(e) => setRaceFilter(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            <option value="">Alle Rennen</option>
            {uniqueRaces.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            <option value="">Alle Aktionen</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} Einträge</span>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-surface-2">
          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">Lade…</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">Keine Einträge.</div>
          ) : (
            <ul className="divide-y divide-border/50">
              {filtered.map((r) => <LogEntry key={r.id} row={r} profile={r.user_id ? profiles[r.user_id] : undefined} race={r.race_id ? races[r.race_id] : undefined} />)}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function LogEntry({ row, profile, race }: { row: LogRow; profile?: Profile; race?: Race }) {
  const who = profile?.full_name || profile?.email || "Unbekannt";
  const what = ACTION_LABEL[row.action] ?? row.action;
  const color = ACTION_COLOR[row.action] ?? ACTION_COLOR.updated;
  const title = (row.new_values?.title ?? row.old_values?.title) || "(ohne Titel)";
  const detail = describeChange(row);
  const when = new Date(row.created_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Avatar profile={profile} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{who}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${color}`}>{what}</span>
          <span className="truncate text-foreground/80">{title}</span>
          {race && <span className="text-xs text-muted-foreground">· {race.name}</span>}
        </div>
        {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
      </div>
      <div className="shrink-0 text-xs text-muted-foreground">{when}</div>
    </li>
  );
}

function Avatar({ profile }: { profile?: Profile }) {
  if (profile?.avatar_url) return <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />;
  const letter = (profile?.full_name || profile?.email || "?").charAt(0).toUpperCase();
  return <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">{letter}</div>;
}

function describeChange(row: LogRow): string | null {
  const o = row.old_values ?? {};
  const n = row.new_values ?? {};
  switch (row.action) {
    case "renamed":
      return `„${o.title ?? "—"}" → „${n.title ?? "—"}"`;
    case "status_changed":
      return `${o.status} → ${n.status}`;
    case "moved":
      if (o.position !== n.position) return `Position ${o.position} → ${n.position}`;
      if (o.area !== n.area) return `Bereich ${o.area} → ${n.area}`;
      return "Verschoben";
    case "replaced":
      return n.format ? `Neues Bild (${n.format}, ${n.original_size_kb ?? "?"} KB)` : "Neues Bild hochgeladen";
    case "uploaded":
      return n.format ? `${n.format}, ${n.original_size_kb ?? "?"} KB` : null;
    default:
      return null;
  }
}
