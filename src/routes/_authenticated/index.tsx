import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, Plus, X, Trash2, LogOut } from "lucide-react";
import { removeFile } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RaceCard, type SliderSection } from "@/components/dashboard/RaceCard";
import { AddRaceDialog } from "@/components/dashboard/AddRaceDialog";
import { ExportDialog } from "@/components/dashboard/ExportDialog";
import type { SliderImage } from "@/components/dashboard/ImageCell";
import { dataTransferHasFiles } from "@/lib/dropFiles";
import { UserMenu } from "@/components/dashboard/UserMenu";
import logoAsset from "@/assets/global-tickets-logo.svg.asset.json";

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

function Dashboard() {
  const [races, setRaces] = useState<Race[]>([]);
  const [sections, setSections] = useState<SliderSection[]>([]);
  const [images, setImages] = useState<SliderImage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "f1" | "motogp" | "dtm" | "wsbk">("all");
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: r }, { data: s }, { data: i }] = await Promise.all([
      supabase.from("races").select("*").order("sort_order").order("created_at"),
      supabase.from("slider_sections").select("*").order("sort_order"),
      supabase.from("slider_images").select("*"),
    ]);
    setRaces((r ?? []) as Race[]);
    setSections((s ?? []) as SliderSection[]);
    setImages((i ?? []) as SliderImage[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

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

  const sectionsByRace = useMemo(() => {
    const m = new Map<string, SliderSection[]>();
    for (const s of sections) {
      if (!m.has(s.race_id)) m.set(s.race_id, []);
      m.get(s.race_id)!.push(s);
    }
    return m;
  }, [sections]);

  const imagesByRace = useMemo(() => {
    const m = new Map<string, SliderImage[]>();
    for (const im of images) {
      if (!m.has(im.race_id)) m.set(im.race_id, []);
      m.get(im.race_id)!.push(im);
    }
    return m;
  }, [images]);


  const visibleRaces = filter === "all" ? races : races.filter((r) => r.series === filter);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const selectedImgs = images.filter((i) => selected.has(i.id));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-surface-2/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={logoAsset.url} alt="Global Tickets" className="h-9 w-auto" />
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
            <div className="flex rounded-md border border-border bg-background p-0.5">
              {(["all", "f1", "motogp", "dtm", "wsbk"] as const).map((k) => (
                <button key={k} onClick={() => setFilter(k)}
                  className={`rounded px-3 py-1 text-xs font-bold uppercase tracking-wider transition ${
                    filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {k === "all" ? "All" : k === "motogp" ? "MotoGP" : k.toUpperCase()}
                </button>
              ))}
            </div>
            <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-1.5">
              <Plus className="h-4 w-4" /> Race
            </Button>
            <Button
              onClick={async () => {
                if (selectedImgs.length === 0) return;
                if (!confirm(`${selectedImgs.length} Slot(s) endgültig löschen? Die zugehörigen Bilder werden ebenfalls entfernt.`)) return;
                await Promise.all(selectedImgs.flatMap((img) => [
                  img.original_path ? removeFile("originals", img.original_path).catch(() => {}) : Promise.resolve(),
                  img.compressed_path ? removeFile("compressed", img.compressed_path).catch(() => {}) : Promise.resolve(),
                ]));
                await supabase.from("slider_images").delete().in("id", selectedImgs.map((i) => i.id));
                setSelected(new Set());
                load();
              }}
              disabled={selected.size === 0}
              variant="outline"
              className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              Löschen {selected.size > 0 && <span className="rounded bg-destructive/20 px-1.5 text-xs">{selected.size}</span>}
            </Button>
            <Button
              onClick={() => setExportOpen(true)}
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
        ) : (
          visibleRaces.map((race) => (
            <RaceCard
              key={race.id}
              race={race}
              sections={sectionsByRace.get(race.id) ?? []}
              images={imagesByRace.get(race.id) ?? []}
              selected={selected}
              onToggleSelect={toggle}
              onReload={load}
            />
          ))
        )}
      </main>

      <AddRaceDialog open={addOpen} onOpenChange={setAddOpen} onCreated={load} />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        images={selectedImgs}
        races={races}
        onDone={() => { setSelected(new Set()); load(); }}
      />
    </div>
  );
}
