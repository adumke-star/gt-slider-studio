import { useMemo, useState } from "react";
import { Search, AlertCircle, MessageSquare, Flag, CheckCircle2, Trash2 } from "lucide-react";
import { SERIES, type Series, type RaceFlags } from "./RaceNav";

export type OverviewRace = {
  id: string;
  name: string;
  series: Series;
  race_date: string | null;
};

const SERIES_LABEL = new Map(SERIES.map((s) => [s.key, s.label]));

export function OverviewDashboard({
  races,
  flagsByRace,
  canEdit,
  onOpenRace,
  onOpenSeries,
  onRequestDeleteRace,
}: {
  races: OverviewRace[];
  flagsByRace: Map<string, RaceFlags>;
  canEdit: boolean;
  onOpenRace: (raceId: string) => void;
  onOpenSeries: (series: Series) => void;
  onRequestDeleteRace: (race: OverviewRace) => void;
}) {
  const [query, setQuery] = useState("");

  const flags = (id: string): RaceFlags =>
    flagsByRace.get(id) ?? { hasChanges: false, hasOpenComments: false };

  const changesCount = useMemo(
    () => races.filter((r) => flags(r.id).hasChanges).length,
    [races, flagsByRace],
  );
  const commentsCount = useMemo(
    () => races.filter((r) => flags(r.id).hasOpenComments).length,
    [races, flagsByRace],
  );

  const attention = useMemo(
    () => races.filter((r) => flags(r.id).hasChanges || flags(r.id).hasOpenComments),
    [races, flagsByRace],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? races.filter((r) => r.name.toLowerCase().includes(q)) : races;
  }, [races, query]);

  const groups = useMemo(() => {
    return SERIES.map((s) => ({
      series: s.key,
      label: s.label,
      races: filtered.filter((r) => r.series === s.key),
    })).filter((g) => g.races.length > 0);
  }, [filtered]);

  const seriesCounts = useMemo(() => {
    const m = new Map<Series, number>();
    for (const r of races) m.set(r.series, (m.get(r.series) ?? 0) + 1);
    return m;
  }, [races]);

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={<Flag className="h-4 w-4" />}
          label="Total races"
          value={races.length}
          hint={SERIES.filter((s) => (seriesCounts.get(s.key) ?? 0) > 0)
            .map((s) => `${s.label} ${seriesCounts.get(s.key)}`)
            .join("  ·  ") || "No races"}
        />
        <KpiCard
          icon={<AlertCircle className="h-4 w-4 text-[#CB4F10]" />}
          label="With changes"
          value={changesCount}
          hint={changesCount === 0 ? "No open changes" : "Races with change markers"}
        />
        <KpiCard
          icon={<MessageSquare className="h-4 w-4 text-[#FACC15]" />}
          label="Open comments"
          value={commentsCount}
          hint={commentsCount === 0 ? "No open comments" : "Races with open comments"}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Needs attention
        </h2>
        {attention.length === 0 ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-surface-2/40 px-4 py-3 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-[var(--status-live)]" />
            All caught up — no open changes or comments.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((r) => (
              <RaceTile key={r.id} race={r} flags={flags(r.id)} canEdit={canEdit} onOpen={onOpenRace} onDelete={onRequestDeleteRace} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
            All races
          </h2>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search races…"
              className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-surface-2/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No races found{query ? ` for "${query}"` : ""}.
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.series} className="space-y-2">
              <button
                onClick={() => onOpenSeries(g.series)}
                className="group inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary"
              >
                {g.label}
                <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] text-foreground">
                  {g.races.length}
                </span>
                <span className="opacity-0 transition group-hover:opacity-100">→</span>
              </button>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.races.map((r) => (
                  <RaceTile key={r.id} race={r} flags={flags(r.id)} canEdit={canEdit} onOpen={onOpenRace} onDelete={onRequestDeleteRace} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-display text-3xl font-black leading-none">{value}</div>
      <div className="mt-1.5 truncate text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function RaceTile({
  race,
  flags,
  canEdit,
  onOpen,
  onDelete,
}: {
  race: OverviewRace;
  flags: RaceFlags;
  canEdit: boolean;
  onOpen: (raceId: string) => void;
  onDelete: (race: OverviewRace) => void;
}) {
  return (
    <div className="group relative">
      <button
        onClick={() => onOpen(race.id)}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-surface-2/60 px-4 py-3 pr-12 text-left transition hover:border-primary hover:bg-surface-2"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-sm font-bold uppercase tracking-wider">{race.name}</span>
            {flags.hasChanges && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#CB4F10]" />}
            {flags.hasOpenComments && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FACC15]" />}
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
            {SERIES_LABEL.get(race.series) ?? race.series} {race.race_date ? `· ${race.race_date}` : ""}
          </div>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground transition group-hover:opacity-0">Open →</span>
      </button>
      {canEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(race); }}
          title="Delete race"
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 transition hover:bg-background hover:text-destructive focus:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
