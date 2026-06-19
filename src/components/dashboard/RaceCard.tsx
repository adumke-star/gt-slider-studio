import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, ExternalLink, Pencil, Check, X, GripVertical } from "lucide-react";
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

export type SliderSection = {
  id: string;
  race_id: string;
  kind: "plp" | "pdp";
  name: string;
  sort_order: number;
  external_url: string | null;
};

export function RaceCard({
  race,
  sections,
  images,
  selected,
  onToggleSelect,
  onReload,
}: {
  race: Race;
  sections: SliderSection[];
  images: SliderImage[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [sectionDragId, setSectionDragId] = useState<string | null>(null);


  // PLP always first, then PDP. Inside each kind: sort_order, then name.
  const sorted = useMemo(() => {
    const byKind = (k: "plp" | "pdp") =>
      sections.filter((s) => s.kind === k)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    return [...byKind("plp"), ...byKind("pdp")];
  }, [sections]);

  const imagesBySection = useMemo(() => {
    const m = new Map<string, SliderImage[]>();
    for (const i of images) {
      const k = i.section_id ?? "_orphan";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.position - b.position);
    return m;
  }, [images]);

  async function addSection(kind: "plp" | "pdp") {
    const max = sorted.length ? Math.max(...sorted.map((s) => s.sort_order)) : -1;
    const count = sorted.filter((s) => s.kind === kind).length + 1;
    await supabase.from("slider_sections").insert({
      race_id: race.id, kind,
      name: `${kind.toUpperCase()} Slider ${count}`,
      sort_order: max + 1,
    });
    onReload();
  }

  async function deleteSection(s: SliderSection) {
    if (!confirm(`Sektion „${s.name}" wirklich löschen? Alle Bilder darin werden entfernt.`)) return;
    await supabase.from("slider_sections").delete().eq("id", s.id);
    onReload();
  }

  async function renameSection(s: SliderSection, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === s.name) return;
    await supabase.from("slider_sections").update({ name: trimmed }).eq("id", s.id);
    onReload();
  }

  async function setSectionUrl(s: SliderSection, url: string | null) {
    await supabase.from("slider_sections").update({ external_url: url }).eq("id", s.id);
    onReload();
  }

  async function addSlot(s: SliderSection) {
    const list = imagesBySection.get(s.id) ?? [];
    const nextPos = (list[list.length - 1]?.position ?? -1) + 1;
    await supabase.from("slider_images").insert({
      race_id: race.id,
      area: s.kind,
      section_id: s.id,
      position: nextPos,
      status: "blank",
    });
    onReload();
  }

  async function deleteRace() {
    if (!confirm(`Rennen „${race.name}" und alle Bilder löschen?`)) return;
    await supabase.from("races").delete().eq("id", race.id);
    onReload();
  }

  async function reorder(section: SliderSection, draggedId: string, targetId: string, side: "before" | "after") {
    if (draggedId === targetId) return;
    const list = (imagesBySection.get(section.id) ?? []).slice();
    const from = list.findIndex((i) => i.id === draggedId);
    if (from === -1) return; // dragged from another section — ignore for now
    const [moved] = list.splice(from, 1);
    let to = list.findIndex((i) => i.id === targetId);
    if (to === -1) return;
    if (side === "after") to += 1;
    list.splice(to, 0, moved);
    // Persist new positions
    await Promise.all(
      list.map((img, idx) =>
        img.position === idx
          ? Promise.resolve()
          : supabase.from("slider_images").update({ position: idx }).eq("id", img.id),
      ),
    );
    setDragId(null);
    onReload();
  }

  async function reorderSection(targetId: string, side: "before" | "after") {
    const draggedId = sectionDragId;
    setSectionDragId(null);
    if (!draggedId || draggedId === targetId) return;
    const dragged = sections.find((s) => s.id === draggedId);
    const target = sections.find((s) => s.id === targetId);
    if (!dragged || !target) return;
    if (dragged.kind !== target.kind) return; // PLP stays above PDP
    const list = sorted.filter((s) => s.kind === dragged.kind);
    const from = list.findIndex((s) => s.id === draggedId);
    const [moved] = list.splice(from, 1);
    let to = list.findIndex((s) => s.id === targetId);
    if (side === "after") to += 1;
    list.splice(to, 0, moved);
    await Promise.all(
      list.map((s, idx) =>
        s.sort_order === idx
          ? Promise.resolve()
          : supabase.from("slider_sections").update({ sort_order: idx }).eq("id", s.id),
      ),
    );
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
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => addSection("plp")} className="h-7 gap-1 text-xs">
            <Plus className="h-3.5 w-3.5" /> PLP
          </Button>
          <Button size="sm" variant="ghost" onClick={() => addSection("pdp")} className="h-7 gap-1 text-xs">
            <Plus className="h-3.5 w-3.5" /> PDP
          </Button>
          <button
            onClick={deleteRace}
            className="rounded p-2 text-muted-foreground hover:bg-background hover:text-destructive"
            title="Delete race"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {open && (
        <div className="space-y-3 p-4">
          {sorted.length === 0 && (
            <div className="grid h-[80px] place-items-center rounded border border-dashed border-border text-xs text-muted-foreground">
              Noch keine Sektion — füge oben eine PLP- oder PDP-Sektion hinzu.
            </div>
          )}
          {sorted.map((s) => {
            const list = imagesBySection.get(s.id) ?? [];
            return (
              <SectionBlock
                key={s.id}
                section={s}
                images={list}
                selected={selected}
                onToggleSelect={onToggleSelect}
                onReload={onReload}
                onRename={(n) => renameSection(s, n)}
                onSetUrl={(u) => setSectionUrl(s, u)}
                onDelete={() => deleteSection(s)}
                onAddSlot={() => addSlot(s)}
                onDragStart={(id) => setDragId(id)}
                onDropOn={(targetId, side) => {
                  if (!dragId) return;
                  reorder(s, dragId, targetId, side);
                }}
                isSectionDragging={sectionDragId === s.id}
                onSectionDragStart={() => setSectionDragId(s.id)}
                onSectionDragEnd={() => setSectionDragId(null)}
                onSectionDropOn={(side) => reorderSection(s.id, side)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function SectionBlock({
  section,
  images,
  selected,
  onToggleSelect,
  onReload,
  onRename,
  onSetUrl,
  onDelete,
  onAddSlot,
  onDragStart,
  onDropOn,
}: {
  section: SliderSection;
  images: SliderImage[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onReload: () => void;
  onRename: (name: string) => void;
  onSetUrl: (url: string | null) => void;
  onDelete: () => void;
  onAddSlot: () => void;
  onDragStart: (id: string) => void;
  onDropOn: (targetId: string, side: "before" | "after") => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(section.name);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(section.external_url ?? "");

  function commitName() {
    setEditingName(false);
    onRename(nameDraft);
  }
  function commitUrl() {
    setEditingUrl(false);
    const v = urlDraft.trim();
    onSetUrl(v || null);
  }

  return (
    <div className="rounded border border-border/60 bg-background/30">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest",
            section.kind === "plp" ? "bg-primary/15 text-primary" : "bg-foreground/10 text-foreground",
          )}>
            {section.kind}
          </span>
          {editingName ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") { setEditingName(false); setNameDraft(section.name); }
                }}
                className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          ) : (
            <button
              onClick={() => { setNameDraft(section.name); setEditingName(true); }}
              className="font-display text-xs font-black uppercase tracking-widest text-foreground hover:text-primary"
              title="Sektion umbenennen"
            >
              {section.name}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {editingUrl ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                type="url"
                placeholder="https://drive…/originale"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitUrl();
                  if (e.key === "Escape") { setEditingUrl(false); setUrlDraft(section.external_url ?? ""); }
                }}
                className="w-56 rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
              />
              <button onClick={commitUrl} className="rounded p-1 text-primary hover:bg-background" title="Speichern">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { setEditingUrl(false); setUrlDraft(section.external_url ?? ""); }}
                className="rounded p-1 text-muted-foreground hover:bg-background"
                title="Abbrechen"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              {section.external_url ? (
                <a
                  href={section.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-primary hover:border-primary"
                  title={section.external_url}
                >
                  <ExternalLink className="h-3 w-3" /> Originale
                </a>
              ) : null}
              <button
                onClick={() => setEditingUrl(true)}
                className="rounded p-1 text-muted-foreground hover:bg-background hover:text-primary"
                title={section.external_url ? "Link bearbeiten" : "Externen Link hinzufügen"}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={onAddSlot}
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary">
            <Plus className="h-3.5 w-3.5" /> Slot
          </Button>
          <button
            onClick={onDelete}
            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
            title="Sektion löschen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto p-3">
        {images.length === 0 && (
          <div className="grid h-[120px] w-full place-items-center text-xs text-muted-foreground">
            Noch keine Slots — füge oben einen Slot hinzu.
          </div>
        )}
        {images.map((img) => (
          <ImageCell
            key={img.id}
            image={img}
            selected={selected.has(img.id)}
            onToggleSelect={() => onToggleSelect(img.id)}
            onChanged={onReload}
            onDragStart={() => onDragStart(img.id)}
            onDropBefore={() => onDropOn(img.id, "before")}
            onDropAfter={() => onDropOn(img.id, "after")}
          />
        ))}
      </div>
    </div>
  );
}
