import { EMPTY_FLAGS, type Series, type RaceFlags } from "./RaceNav";

export type ListRace = {
  id: string;
  name: string;
  series: Series;
  race_date: string | null;
};

export function RaceListView({
  races,
  flagsByRace,
  onOpen,
}: {
  races: ListRace[];
  flagsByRace: Map<string, RaceFlags>;
  onOpen: (raceId: string) => void;
}) {
  if (races.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {races.map((r) => {
        const f = flagsByRace.get(r.id) ?? EMPTY_FLAGS;
        return (
          <button
            key={r.id}
            onClick={() => onOpen(r.id)}
            className="group flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2/60 px-4 py-3 text-left transition hover:border-primary hover:bg-surface-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-bold uppercase tracking-wider">{r.name}</span>
                {f.hasChanges && <span className="h-1.5 w-1.5 rounded-full bg-[#CB4F10]" />}
                {f.hasOpenComments && <span className="h-1.5 w-1.5 rounded-full bg-[#FACC15]" />}
                {f.hasSolved && <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-solved)]" />}
                {f.hasRuleViolations && <span title="Rule violations" className="h-1.5 w-1.5 rounded-full bg-destructive" />}
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                {r.series} {r.race_date ? `· ${r.race_date}` : ""}
              </div>
            </div>
            <span className="text-xs text-muted-foreground group-hover:text-primary">Open →</span>
          </button>
        );
      })}
    </div>
  );
}
