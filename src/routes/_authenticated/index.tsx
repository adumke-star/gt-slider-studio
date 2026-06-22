import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, X, Trash2, Wand2 } from "lucide-react";
import { removeFile } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RaceCard, type SliderSection } from "@/components/dashboard/RaceCard";
import { AddRaceDialog } from "@/components/dashboard/AddRaceDialog";
import { ExportDialog } from "@/components/dashboard/ExportDialog";
import { CompressDialog } from "@/components/dashboard/CompressDialog";
import type { SliderImage } from "@/components/dashboard/ImageCell";
import { dataTransferHasFiles } from "@/lib/dropFiles";
import { UserMenu } from "@/components/dashboard/UserMenu";
import { RaceNav, type NavSelection, type RaceFlags } from "@/components/dashboard/RaceNav";
import { RaceListView } from "@/components/dashboard/RaceListView";
import logoUrl from "@/assets/global-tickets-logo.png";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Slider Studio — F1 & MotoGP Image Manager" },
      { name: "description", content: "Manage, optimise and export slider images for F1 and MotoGP race pages." },
    ],
  }),
  component: Dashboard,
});

type Race = {
  id: string;
  name: string;
  series: "f1" | "motogp" | "dtm" | "wsbk";
  race_date: string | null;
  sort_order: number;
};

type RaceBundle = { sections: SliderSection[]; images: SliderImage[] };

function Dashboard() {
  const [races, setRaces] = useState<Race[]>([]);
  const [flagsByRace, setFlagsByRace] = useState<Map<string, RaceFlags>>(new Map());
  const [bundleByRace, setBundleByRace] = useState<Map<string, RaceBundle>>(new Map());
  const [loadingRaceIds, setLoadingRaceIds] = useState<Set<string>>(new Set());

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportImages, setExportImages] = useState<SliderImage[] | null>(null);
  const [compressOpen, setCompressOpen] = useState(false);
  const [compressImages, setCompressImages] = useState<SliderImage[] | null>(null);
  const [selection, setSelection] = useState<NavSelection>({ kind: "series", series: "f1" });
  const [loading, setLoading] = useState(true);

  const bundleRef = useRef(bundleByRace);
  bundleRef.current = bundleByRace;

  const loadRaces = useCallback(async () => {
    const { data } = await supabase.from("races").select("*").order("sort_order").order("created_at");
    setRaces((data ?? []) as Race[]);
  }, []);

  const loadFlags = useCallback(async () => {
    const { data } = await supabase.rpc("race_status_flags");
    const m = new Map<string, RaceFlags>();
    for (const r of data ?? []) {
      m.set(r.race_id as string, {
        hasChanges: !!r.has_changes,
        hasOpenComments: !!r.has_open_comments,
      });
    }
    setFlagsByRace(m);
  }, []);

  const loadRace = useCallback(async (raceId: string) => {
    setLoadingRaceIds((s) => {
      const n = new Set(s);
      n.add(raceId);
      return n;
    });
    const [{ data: s }, { data: i }] = await Promise.all([
      supabase.from("slider_sections").select("*").eq("race_id", raceId).order("sort_order"),
      supabase.from("slider_images").select("*").eq("race_id", raceId),
    ]);
    setBundleByRace((prev) => {
      const n = new Map(prev);
      n.set(raceId, {
        sections: (s ?? []) as SliderSection[],
        images: (i ?? []) as SliderImage[],
      });
      return n;
    });
    setLoadingRaceIds((s) => {
      const n = new Set(s);
      n.delete(raceId);
      return n;
    });
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([loadRaces(), loadFlags()]);
      setLoading(false);
    })();
  }, [loadRaces, loadFlags]);

  useEffect(() => {
    const prevent = (e: DragEvent) => {
      if (e.dataTransfer && dataTransferHasFiles(e.dataTransfer)) e.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  // Visible races based on selection
  const visibleRaces = useMemo(
    () =>
      selection.kind === "series"
        ? races.filter((r) => r.series === selection.series)
        : races.filter((r) => r.id === selection.raceId),
    [races, selection],
  );

  // For race selection: load that one race's bundle if not cached
  useEffect(() => {
    if (selection.kind !== "race") return;
    if (bundleRef.current.has(selection.raceId)) return;
    loadRace(selection.raceId);
  }, [selection, loadRace]);

  // Realtime: keep flags + any currently loaded race in sync
  useEffect(() => {
    if (loading) return;
    const refetchRace = (raceId: string) => {
      if (bundleRef.current.has(raceId)) loadRace(raceId);
    };
    const channel = supabase
      .channel("dashboard-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "slider_images" }, (payload) => {
        loadFlags();
        const row = (payload.new ?? payload.old) as { race_id?: string } | null;
        if (row?.race_id) refetchRace(row.race_id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "slider_sections" }, (payload) => {
        const row = (payload.new ?? payload.old) as { race_id?: string } | null;
        if (row?.race_id) refetchRace(row.race_id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => {
        loadFlags();
        // also refresh active race so comment threads update
        for (const id of bundleRef.current.keys()) refetchRace(id);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loading, loadFlags, loadRace]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // All loaded images (across cached races) — needed for selection-based actions
  const loadedImages = useMemo(() => {
    const arr: SliderImage[] = [];
    for (const b of bundleByRace.values()) arr.push(...b.images);
    return arr;
  }, [bundleByRace]);

  const selectedImgs = loadedImages.filter((i) => selected.has(i.id));

  const onSelectNav = (sel: NavSelection) => {
    setSelected(new Set());
    setSelection(sel);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-surface-2/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Global Tickets" className="h-9 w-auto" />
            <div className="min-w-0">
              <h1 className="font-display text-xl font-black uppercase leading-none tracking-tight">
                Slider <span className="text-primary">Studio</span>
              </h1>
              <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                WEB-READY ASSETS
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <RaceNav races={races} flagsByRace={flagsByRace} selection={selection} onSelect={onSelectNav} />
            <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-1.5">
              <Plus className="h-4 w-4" /> Race
            </Button>
            <Button
              onClick={async () => {
                if (selectedImgs.length === 0) return;
                if (!confirm(`Permanently delete ${selectedImgs.length} slot(s)? Their images will also be removed.`)) return;
                await Promise.all(selectedImgs.flatMap((img) => [
                  img.original_path ? removeFile("originals", img.original_path).catch(() => {}) : Promise.resolve(),
                  img.compressed_path ? removeFile("compressed", img.compressed_path).catch(() => {}) : Promise.resolve(),
                ]));
                await supabase.from("slider_images").delete().in("id", selectedImgs.map((i) => i.id));
                const raceIds = new Set(selectedImgs.map((i) => i.race_id));
                setSelected(new Set());
                await Promise.all([loadFlags(), ...Array.from(raceIds).map((id) => loadRace(id))]);
              }}
              disabled={selected.size === 0}
              variant="outline"
              className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              Delete {selected.size > 0 && <span className="rounded bg-destructive/20 px-1.5 text-xs">{selected.size}</span>}
            </Button>

            <Button
              onClick={() => {
                const imgs = selectedImgs.filter((i) => i.original_path);
                if (imgs.length === 0) {
                  toast.error("Keine unkomprimierten Bilder ausgewählt.");
                  return;
                }
                setCompressImages(imgs);
                setCompressOpen(true);
              }}
              disabled={selected.size === 0}
              variant="outline"
              className="gap-1.5 disabled:opacity-40"
            >
              <Wand2 className="h-4 w-4" />
              Compress {selected.size > 0 && <span className="rounded bg-foreground/10 px-1.5 text-xs">{selected.size}</span>}
            </Button>
            <Button
              onClick={() => {
                const imgs = selectedImgs.filter((i) => i.compressed_path);
                if (imgs.length === 0) {
                  toast.error("Keine komprimierten Bilder ausgewählt. Bitte zuerst komprimieren.");
                  return;
                }
                setExportImages(imgs);
                setExportOpen(true);
              }}
              disabled={selected.size === 0}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Export {selected.size > 0 && <span className="rounded bg-primary-foreground/20 px-1.5 text-xs">{selected.size}</span>}
            </Button>
            <UserMenu />
          </div>
        </div>

        {selected.size > 0 && (
          <div className="border-t border-border bg-primary/10 px-6 py-2 text-xs text-primary">
            <button onClick={() => setSelected(new Set())} className="inline-flex items-center gap-1 hover:underline">
              <X className="h-3 w-3" /> Clear selection ({selected.size})
            </button>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 px-6 py-6">
        {loading ? (
          <div className="grid h-[40vh] place-items-center text-sm text-muted-foreground">Loading…</div>
        ) : visibleRaces.length === 0 ? (
          <div className="grid h-[50vh] place-items-center rounded-lg border border-dashed border-border bg-surface-2/40 text-center">
            <div>
              <h2 className="font-display text-2xl uppercase">No races yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">Add your first race to start managing slider images.</p>
              <Button onClick={() => setAddOpen(true)} className="mt-4 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" /> New race
              </Button>
            </div>
          </div>
        ) : selection.kind === "series" ? (
          <RaceListView
            races={visibleRaces}
            flagsByRace={flagsByRace}
            onOpen={(raceId) => onSelectNav({ kind: "race", raceId })}
          />
        ) : (
          visibleRaces.map((race) => {
            const bundle = bundleByRace.get(race.id);
            const isLoading = loadingRaceIds.has(race.id);
            if (!bundle) {
              return (
                <div
                  key={race.id}
                  className="grid h-40 place-items-center rounded-lg border border-border bg-surface-2/40 text-sm text-muted-foreground"
                >
                  {isLoading ? "Loading race…" : "Preparing…"}
                </div>
              );
            }
            return (
              <RaceCard
                key={race.id}
                race={race}
                sections={bundle.sections}
                images={bundle.images}
                selected={selected}
                onToggleSelect={toggle}
                onReload={() => {
                  loadRace(race.id);
                  loadFlags();
                }}
                onExport={(imgs) => { setExportImages(imgs); setExportOpen(true); }}
                onCompress={(imgs) => { setCompressImages(imgs); setCompressOpen(true); }}
              />
            );
          })
        )}
      </main>

      <AddRaceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={async () => {
          await Promise.all([loadRaces(), loadFlags()]);
        }}
      />
      <CompressDialog
        open={compressOpen}
        onOpenChange={(v) => { setCompressOpen(v); if (!v) setCompressImages(null); }}
        images={compressImages ?? selectedImgs.filter((i) => i.original_path)}
        onDone={async () => {
          setCompressImages(null);
          await loadFlags();
          if (selection.kind === "race") await loadRace(selection.raceId);
        }}
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={(v) => { setExportOpen(v); if (!v) setExportImages(null); }}
        images={exportImages ?? selectedImgs.filter((i) => i.compressed_path)}
        races={races}
        onDone={async () => {
          await loadFlags();
          if (selection.kind === "race") await loadRace(selection.raceId);
        }}
      />
    </div>
  );
}
