import { useMemo, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ImageCell, type SliderImage } from "./ImageCell";
import { cn } from "@/lib/utils";

type Race = {
  id: string;
  name: string;
  series: "f1" | "motogp";
  race_date: string | null;
  sort_order: number;
};

const AREAS: { key: "plp" | "pdp"; label: string }[] = [
  { key: "plp", label: "PLP" },
  { key: "pdp", label: "PDP" },
];

export function RaceCard({
  race,
  images,
  selected,
  onToggleSelect,
  onReload,
}: {
  race: Race;
  images: SliderImage[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);

  const byArea = useMemo(() => {
    const m: Record<string, SliderImage[]> = { plp: [], pdp: [] };
    for (const i of images) m[i.area]?.push(i);
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.position - b.position);
    return m;
  }, [images]);

  async function addSlot(area: "plp" | "pdp") {
    const list = byArea[area];
    const nextPos = (list[list.length - 1]?.position ?? -1) + 1;
    await supabase.from("slider_images").insert({
      race_id: race.id, area, position: nextPos, status: "blank",
    });
    onReload();
  }

  async function deleteRace() {
    if (!confirm(`Delete race "${race.name}" and all its images?`)) return;
    // delete images files? keep simple — DB cascade removes rows
    await supabase.from("races").delete().eq("id", race.id);
    onReload();
  }

  async function swap(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const a = images.find((i) => i.id === dragId);
    const b = images.find((i) => i.id === targetId);
    if (!a || !b) return;
    await supabase.from("slider_images").update({ position: b.position, area: b.area }).eq("id", a.id);
    await supabase.from("slider_images").update({ position: a.position, area: a.area }).eq("id", b.id);
    setDragId(null);
    onReload();
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface-2">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/40 px-4 py-3 sm:flex sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => setOpen((o) => !o)} className="text-muted-foreground hover:text-primary">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <span className={cn(
            "shrink-0 rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-widest",
            race.series === "f1" ? "bg-primary text-primary-foreground" : "bg-foreground/90 text-background",
          )}>
            {race.series === "f1" ? "F1" : "MotoGP"}
          </span>
          <h2 className="truncate font-display text-lg font-black uppercase tracking-tight">{race.name}</h2>
          {race.race_date && (
            <span className="hidden text-xs text-muted-foreground sm:inline">{race.race_date}</span>
          )}
        </div>
        <button
          onClick={deleteRace}
          className="shrink-0 rounded p-2 text-muted-foreground hover:bg-background hover:text-destructive"
          title="Delete race"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      {open && (
        <div className="space-y-3 p-4">
          {AREAS.map(({ key, label }) => (
            <div key={key} className="rounded border border-border/60 bg-background/30">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                <div className="font-display text-xs font-black uppercase tracking-widest text-muted-foreground">
                  {label} <span className="text-primary">·</span> Slider
                </div>
                <Button size="sm" variant="ghost" onClick={() => addSlot(key)}
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary">
                  <Plus className="h-3.5 w-3.5" /> Slot
                </Button>
              </div>
              <div className="flex gap-3 overflow-x-auto p-3">
                {byArea[key].length === 0 && (
                  <div className="grid h-[120px] w-full place-items-center text-xs text-muted-foreground">
                    No slots yet — add one to begin.
                  </div>
                )}
                {byArea[key].map((img) => (
                  <ImageCell
                    key={img.id}
                    image={img}
                    selected={selected.has(img.id)}
                    onToggleSelect={() => onToggleSelect(img.id)}
                    onChanged={onReload}
                    onDragStart={() => setDragId(img.id)}
                    onDrop={() => swap(img.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
