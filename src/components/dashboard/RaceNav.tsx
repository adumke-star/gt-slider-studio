import { useMemo } from "react";
import { ChevronDown, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type Series = "f1" | "motogp" | "dtm" | "wsbk";

export type NavRace = {
  id: string;
  name: string;
  series: Series;
};

export type RaceFlags = {
  hasChanges: boolean;
  hasOpenComments: boolean;
  hasSolved: boolean;
  hasRuleViolations?: boolean;
};

export const EMPTY_FLAGS: RaceFlags = {
  hasChanges: false,
  hasOpenComments: false,
  hasSolved: false,
  hasRuleViolations: false,
};

export type NavSelection =
  | { kind: "overview" }
  | { kind: "series"; series: Series }
  | { kind: "race"; raceId: string };

export const SERIES: { key: Series; label: string }[] = [
  { key: "f1", label: "F1" },
  { key: "motogp", label: "MotoGP" },
  { key: "dtm", label: "DTM" },
  { key: "wsbk", label: "WSBK" },
];

function NavStatusDot({ kind }: { kind: "changes" | "comments" | "solved" | "rules" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-background",
        kind === "changes"
          ? "bg-status-changes"
          : kind === "solved"
            ? "bg-status-solved"
            : kind === "rules"
              ? "bg-destructive"
              : "bg-status-done",
      )}
    />
  );
}

export function RaceNav({
  races,
  flagsByRace,
  selection,
  onSelect,
}: {
  races: NavRace[];
  flagsByRace: Map<string, RaceFlags>;
  selection: NavSelection;
  onSelect: (sel: NavSelection) => void;
}) {
  const racesBySeries = useMemo(() => {
    const m = new Map<Series, NavRace[]>();
    for (const r of races) {
      if (!m.has(r.series)) m.set(r.series, []);
      m.get(r.series)!.push(r);
    }
    return m;
  }, [races]);

  function raceFlags(raceId: string): RaceFlags {
    return flagsByRace.get(raceId) ?? EMPTY_FLAGS;
  }

  function seriesFlags(series: Series): RaceFlags {
    const list = racesBySeries.get(series) ?? [];
    let hasChanges = false;
    let hasOpenComments = false;
    let hasSolved = false;
    let hasRuleViolations = false;
    for (const r of list) {
      const f = raceFlags(r.id);
      if (f.hasChanges) hasChanges = true;
      if (f.hasOpenComments) hasOpenComments = true;
      if (f.hasSolved) hasSolved = true;
      if (f.hasRuleViolations) hasRuleViolations = true;
      if (hasChanges && hasOpenComments && hasSolved && hasRuleViolations) break;
    }
    return { hasChanges, hasOpenComments, hasSolved, hasRuleViolations };
  }

  const selectedRace =
    selection.kind === "race" ? races.find((r) => r.id === selection.raceId) ?? null : null;

  const baseBtn =
    "rounded px-3 py-1 text-xs font-bold uppercase tracking-wider transition inline-flex items-center gap-1.5";

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background p-0.5">
      <button
        onClick={() => onSelect({ kind: "overview" })}
        className={cn(
          baseBtn,
          "cursor-pointer outline-none",
          selection.kind === "overview"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="h-3 w-3" />
        <span>Overview</span>
      </button>
      {SERIES.map((s) => {
        const list = racesBySeries.get(s.key) ?? [];
        const active =
          (selection.kind === "series" && selection.series === s.key) ||
          (selectedRace?.series === s.key);
        const flags = seriesFlags(s.key);
        const label = selectedRace?.series === s.key ? `${s.label} › ${selectedRace.name}` : s.label;
        return (
          <DropdownMenu key={s.key}>
            <DropdownMenuTrigger
              onClick={() => onSelect({ kind: "series", series: s.key })}
              className={cn(
                baseBtn,
                "cursor-pointer outline-none",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>{label}</span>
              {flags.hasChanges && <NavStatusDot kind="changes" />}
              {flags.hasOpenComments && <NavStatusDot kind="comments" />}
              {flags.hasSolved && <NavStatusDot kind="solved" />}
              {flags.hasRuleViolations && <NavStatusDot kind="rules" />}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[12rem]">
              {list.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No races</div>
              ) : (
                list.map((r) => {
                  const f = raceFlags(r.id);
                  const isSel = selection.kind === "race" && selection.raceId === r.id;
                  return (
                    <DropdownMenuItem
                      key={r.id}
                      onClick={() => onSelect({ kind: "race", raceId: r.id })}
                      className={cn(
                        "flex items-center justify-between gap-3",
                        isSel && "bg-accent text-[#5c4900] focus:text-[#5c4900]",
                      )}
                    >
                      <span className="truncate">{r.name}</span>
                      <span className="flex items-center gap-1">
                        {f.hasChanges && <NavStatusDot kind="changes" />}
                        {f.hasOpenComments && <NavStatusDot kind="comments" />}
                        {f.hasSolved && <NavStatusDot kind="solved" />}
                        {f.hasRuleViolations && <NavStatusDot kind="rules" />}
                      </span>
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
}
