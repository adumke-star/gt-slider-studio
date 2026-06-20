import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SliderImage } from "./ImageCell";

export type Series = "f1" | "motogp" | "dtm" | "wsbk";

export type NavRace = {
  id: string;
  name: string;
  series: Series;
};

export type NavSelection =
  | { kind: "series"; series: Series }
  | { kind: "race"; raceId: string };

const SERIES: { key: Series; label: string }[] = [
  { key: "f1", label: "F1" },
  { key: "motogp", label: "MotoGP" },
  { key: "dtm", label: "DTM" },
  { key: "wsbk", label: "WSBK" },
];

export function RaceNav({
  races,
  images,
  selection,
  onSelect,
}: {
  races: NavRace[];
  images: SliderImage[];
  selection: NavSelection;
  onSelect: (sel: NavSelection) => void;
}) {
  const [openCommentImageIds, setOpenCommentImageIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (images.length === 0) return;
    let alive = true;
    const refetch = async () => {
      const { data } = await supabase
        .from("comments")
        .select("image_id")
        .is("resolved_at", null);
      if (!alive) return;
      setOpenCommentImageIds(new Set((data ?? []).map((r) => r.image_id as string)));
    };
    refetch();
    const channel = supabase
      .channel("nav-open-comments")
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => refetch())
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [images.length]);

  const racesBySeries = useMemo(() => {
    const m = new Map<Series, NavRace[]>();
    for (const r of races) {
      if (!m.has(r.series)) m.set(r.series, []);
      m.get(r.series)!.push(r);
    }
    return m;
  }, [races]);

  const imagesByRace = useMemo(() => {
    const m = new Map<string, SliderImage[]>();
    for (const i of images) {
      if (!m.has(i.race_id)) m.set(i.race_id, []);
      m.get(i.race_id)!.push(i);
    }
    return m;
  }, [images]);

  function raceFlags(raceId: string) {
    const imgs = imagesByRace.get(raceId) ?? [];
    const hasChanges = imgs.some((i) => i.status === "changes");
    const hasOpenComments = imgs.some((i) => openCommentImageIds.has(i.id));
    return { hasChanges, hasOpenComments };
  }

  function seriesFlags(series: Series) {
    const list = racesBySeries.get(series) ?? [];
    let hasChanges = false;
    let hasOpenComments = false;
    for (const r of list) {
      const f = raceFlags(r.id);
      if (f.hasChanges) hasChanges = true;
      if (f.hasOpenComments) hasOpenComments = true;
      if (hasChanges && hasOpenComments) break;
    }
    return { hasChanges, hasOpenComments };
  }

  const selectedRace =
    selection.kind === "race" ? races.find((r) => r.id === selection.raceId) ?? null : null;

  const baseBtn =
    "rounded px-3 py-1 text-xs font-bold uppercase tracking-wider transition inline-flex items-center gap-1.5";

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background p-0.5">

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
              className={cn(
                baseBtn,
                "cursor-pointer outline-none",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>{label}</span>
              {flags.hasChanges && <span className="h-1.5 w-1.5 rounded-full bg-[#CB4F10]" />}
              {flags.hasOpenComments && <span className="h-1.5 w-1.5 rounded-full bg-[#FACC15]" />}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[12rem]">
              <DropdownMenuItem
                onClick={() => onSelect({ kind: "series", series: s.key })}
                className="text-xs font-semibold uppercase tracking-wider"
              >
                All {s.label} races
              </DropdownMenuItem>
              {list.length > 0 && <DropdownMenuSeparator />}
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
                      className={cn("flex items-center justify-between gap-3", isSel && "bg-accent")}
                    >
                      <span className="truncate">{r.name}</span>
                      <span className="flex items-center gap-1">
                        {f.hasChanges && <span className="h-1.5 w-1.5 rounded-full bg-[#CB4F10]" />}
                        {f.hasOpenComments && <span className="h-1.5 w-1.5 rounded-full bg-[#FACC15]" />}
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
