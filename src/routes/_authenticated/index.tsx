import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, X, Trash2, Wand2 } from "lucide-react";
import { removeFile } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RaceCard, type SliderSection } from "@/components/dashboard/RaceCard";
import { AddRaceDialog } from "@/components/dashboard/AddRaceDialog";
import { ExportDialog } from "@/components/dashboard/ExportDialog";
import { CompressDialog } from "@/components/dashboard/CompressDialog";
import type { SliderImage } from "@/components/dashboard/ImageCell";
import { dataTransferHasFiles } from "@/lib/dropFiles";
import { isCompressEligible } from "@/lib/compressImage";
import { UserMenu } from "@/components/dashboard/UserMenu";
import { RaceNav, type NavSelection, type RaceFlags } from "@/components/dashboard/RaceNav";
import { RaceListView } from "@/components/dashboard/RaceListView";
import { OverviewDashboard } from "@/components/dashboard/OverviewDashboard";
import logoUrl from "@/assets/global-tickets-logo.png";
import { useAppRole } from "@/hooks/useAppRole";
import { ROLE_LABELS } from "@/lib/roles";

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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [raceToDelete, setRaceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingRace, setDeletingRace] = useState(false);
  const [selection, setSelection] = useState<NavSelection>({ kind: "overview" });
  const [loading, setLoading] = useState(true);
  const { canEdit, role: appRole, loading: roleLoading } = useAppRole();
  const showEditUI = !roleLoading && canEdit;

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
        hasSolved: !!r.has_solved,
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
      selection.kind === "overview"
        ? races
        : selection.kind === "series"
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

  async function performDelete() {
    if (selectedImgs.length === 0) return;
    setDeleting(true);
    try {
      await Promise.all(selectedImgs.flatMap((img) => [
        img.original_path ? removeFile("originals", img.original_path).catch(() => {}) : Promise.resolve(),
        img.compressed_path ? removeFile("compressed", img.compressed_path).catch(() => {}) : Promise.resolve(),
      ]));
      await supabase.from("slider_images").delete().in("id", selectedImgs.map((i) => i.id));
      const raceIds = new Set(selectedImgs.map((i) => i.race_id));
      setSelected(new Set());
      await Promise.all([loadFlags(), ...Array.from(raceIds).map((id) => loadRace(id))]);
      toast.success(`${selectedImgs.length} slot${selectedImgs.length === 1 ? "" : "s"} deleted`);
      setDeleteOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function performDeleteRace() {
    if (!raceToDelete) return;
    const { id, name } = raceToDelete;
    setDeletingRace(true);
    try {
      // Collect storage paths first (DB cascade removes the rows, not the files).
      const { data: imgs } = await supabase
        .from("slider_images")
        .select("original_path, compressed_path")
        .eq("race_id", id);
      await Promise.all((imgs ?? []).flatMap((img) => [
        img.original_path ? removeFile("originals", img.original_path).catch(() => {}) : Promise.resolve(),
        img.compressed_path ? removeFile("compressed", img.compressed_path).catch(() => {}) : Promise.resolve(),
      ]));

      const { error } = await supabase.from("races").delete().eq("id", id);
      if (error) {
        console.error("delete race failed", error);
        toast.error(`Could not delete race: ${error.message}`);
        return;
      }

      setBundleByRace((prev) => {
        const n = new Map(prev);
        n.delete(id);
        return n;
      });
      setSelected(new Set());
      if (selection.kind === "race" && selection.raceId === id) {
        setSelection({ kind: "overview" });
      }
      await Promise.all([loadRaces(), loadFlags()]);
      toast.success(`Race "${name}" deleted`);
      setRaceToDelete(null);
    } catch (e) {
      console.error(e);
      toast.error("Could not delete race");
    } finally {
      setDeletingRace(false);
    }
  }

  const onSelectNav = (sel: NavSelection) => {
    setSelected(new Set());
    setSelection(sel);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-surface-2/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-6 py-4">
          <button
            onClick={() => onSelectNav({ kind: "overview" })}
            className="flex items-center gap-3 text-left outline-none"
            title="Back to overview"
          >
            <img src={logoUrl} alt="Global Tickets" className="h-9 w-auto" />
            <div className="min-w-0">
              <h1 className="font-display text-xl font-black uppercase leading-none tracking-tight">
                Slider <span className="text-primary">Studio</span>
              </h1>
              <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                {appRole && !canEdit ? `${ROLE_LABELS.viewer} mode` : "WEB-READY ASSETS"}
              </p>
            </div>
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <RaceNav races={races} flagsByRace={flagsByRace} selection={selection} onSelect={onSelectNav} />
            {showEditUI && (
              <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" /> Race
              </Button>
            )}
            {showEditUI && (
              <Button
                onClick={() => {
                  if (selectedImgs.length === 0) return;
                  setDeleteOpen(true);
                }}
                disabled={selected.size === 0}
                variant="outline"
                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
                Delete {selected.size > 0 && <span className="rounded bg-destructive/20 px-1.5 text-xs">{selected.size}</span>}
              </Button>
            )}

            {showEditUI && (
              <Button
                onClick={() => {
                  const imgs = selectedImgs.filter(isCompressEligible);
                  if (imgs.length === 0) {
                    toast.error("No compressible images selected.");
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
            )}
            <Button
              onClick={() => {
                const imgs = selectedImgs.filter((i) => i.compressed_path);
                if (imgs.length === 0) {
                  toast.error("No compressed images selected. Please compress first.");
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
        ) : races.length === 0 ? (
          <div className="grid h-[50vh] place-items-center rounded-lg border border-dashed border-border bg-surface-2/40 text-center">
            <div>
              <h2 className="font-display text-2xl uppercase">No races yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">Add your first race to start managing slider images.</p>
              {showEditUI && (
                <Button onClick={() => setAddOpen(true)} className="mt-4 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> New race
                </Button>
              )}
            </div>
          </div>
        ) : selection.kind === "overview" ? (
          <OverviewDashboard
            races={races}
            flagsByRace={flagsByRace}
            canEdit={showEditUI}
            onOpenRace={(raceId) => onSelectNav({ kind: "race", raceId })}
            onOpenSeries={(series) => onSelectNav({ kind: "series", series })}
            onRequestDeleteRace={(race) => setRaceToDelete({ id: race.id, name: race.name })}
          />
        ) : selection.kind === "series" ? (
          visibleRaces.length === 0 ? (
            <div className="grid h-[30vh] place-items-center rounded-lg border border-dashed border-border bg-surface-2/40 text-center text-sm text-muted-foreground">
              No races in this series.
            </div>
          ) : (
            <RaceListView
              races={visibleRaces}
              flagsByRace={flagsByRace}
              onOpen={(raceId) => onSelectNav({ kind: "race", raceId })}
            />
          )
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
                canEdit={showEditUI}
                onToggleSelect={toggle}
                onReload={() => {
                  loadRace(race.id);
                  loadFlags();
                }}
                onRaceRenamed={loadRaces}
                onExport={(imgs) => { setExportImages(imgs); setExportOpen(true); }}
                onCompress={(imgs) => { setCompressImages(imgs); setCompressOpen(true); }}
                onRequestDeleteRace={(r) => setRaceToDelete({ id: r.id, name: r.name })}
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
        images={compressImages ?? selectedImgs.filter(isCompressEligible)}
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
      <AlertDialog open={deleteOpen} onOpenChange={(v) => { if (!deleting) setDeleteOpen(v); }}>
        <AlertDialogContent className="bg-surface-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl">
              Delete {selectedImgs.length} slot{selectedImgs.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The selected slots will be permanently removed, including their original and compressed images. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); performDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={raceToDelete != null} onOpenChange={(v) => { if (!deletingRace && !v) setRaceToDelete(null); }}>
        <AlertDialogContent className="bg-surface-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl">
              Delete race "{raceToDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The race will be permanently removed along with all sections, image slots, and stored files. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingRace}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); performDeleteRace(); }}
              disabled={deletingRace}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingRace ? "Deleting…" : "Delete race"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
