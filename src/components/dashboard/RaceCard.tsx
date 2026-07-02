import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, ChevronLeft, ExternalLink, Pencil, Check, X, GripVertical, Download, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ImageCell, type SliderImage } from "./ImageCell";
import { cn } from "@/lib/utils";
import { collectFilesFromDataTransfer, dataTransferHasFiles, isImageFile } from "@/lib/dropFiles";
import { isCompressEligible } from "@/lib/compressImage";

type Race = {
  id: string;
  name: string;
  series: "f1" | "motogp" | "dtm" | "wsbk";
  race_date: string | null;
  sort_order: number;
};

export type SectionLink = { label: string; url: string };
export type BatchItem = { name: string; status: "pending" | "uploading" | "done" | "error"; error?: string };

export type SliderSection = {
  id: string;
  race_id: string;
  kind: "plp" | "pdp";
  name: string;
  sort_order: number;
  external_url: string | null;
  external_links: SectionLink[] | null;
};

export function RaceCard({
  race,
  sections,
  images,
  selected,
  canEdit,
  onToggleSelect,
  onReload,
  onExport,
  onCompress,
  onRequestDeleteRace,
  onRaceRenamed,
}: {
  race: Race;
  sections: SliderSection[];
  images: SliderImage[];
  selected: Set<string>;
  canEdit: boolean;
  onToggleSelect: (id: string) => void;
  onReload: () => void;
  onExport: (images: SliderImage[]) => void;
  onCompress: (images: SliderImage[]) => void;
  onRequestDeleteRace: (race: Race) => void;
  onRaceRenamed?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [sectionDragId, setSectionDragId] = useState<string | null>(null);
  const [hasOpenComments, setHasOpenComments] = useState(false);
  const [editingRaceName, setEditingRaceName] = useState(false);
  const [raceNameDraft, setRaceNameDraft] = useState(race.name);

  const hasChanges = useMemo(() => images.some((i) => i.status === "changes"), [images]);
  const hasSolved = useMemo(() => images.some((i) => i.status === "solved"), [images]);

  useEffect(() => {
    if (!editingRaceName) setRaceNameDraft(race.name);
  }, [race.name, editingRaceName]);

  async function renameRace(name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === race.name) return;
    const { error } = await supabase.from("races").update({ name: trimmed }).eq("id", race.id);
    if (error) {
      toast.error("Could not rename race");
      return;
    }
    toast.success("Race renamed");
    onRaceRenamed?.();
    onReload();
  }

  function commitRaceName() {
    setEditingRaceName(false);
    void renameRace(raceNameDraft);
  }

  useEffect(() => {
    if (images.length === 0) {
      setHasOpenComments(false);
      return;
    }
    let alive = true;
    const ids = images.map((i) => i.id);
    const refetch = async () => {
      const { count } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .in("image_id", ids)
        .is("resolved_at", null);
      if (alive) setHasOpenComments((count ?? 0) > 0);
    };
    refetch();
    const channel = supabase
      .channel(`race-comments-${race.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, (payload) => {
        const row = (payload.new ?? payload.old) as { image_id?: string } | null;
        if (row?.image_id && ids.includes(row.image_id)) refetch();
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [images, race.id]);


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
    if (!confirm(`Delete section "${s.name}"? All images inside will be removed.`)) return;
    await supabase.from("slider_sections").delete().eq("id", s.id);
    onReload();
  }

  async function renameSection(s: SliderSection, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === s.name) return;
    await supabase.from("slider_sections").update({ name: trimmed }).eq("id", s.id);
    onReload();
  }

  async function setSectionLinks(s: SliderSection, links: SectionLink[]) {
    await supabase.from("slider_sections").update({
      external_links: links as unknown as never,
    }).eq("id", s.id);
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
      status: "todo",
    });
    onReload();
  }

  async function batchUploadToSection(
    s: SliderSection,
    files: File[],
    onProgress?: (items: BatchItem[]) => void,
  ) {
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length === 0) return;
    imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    const items: BatchItem[] = imageFiles.map((f) => ({ name: f.name, status: "pending" }));
    onProgress?.(items.slice());
    const list = imagesBySection.get(s.id) ?? [];
    let nextPos = (list[list.length - 1]?.position ?? -1) + 1;
    const { uploadFile } = await import("@/lib/storage");
    const { resizeImageFile } = await import("@/lib/imageResize");
    for (let i = 0; i < imageFiles.length; i++) {
      const raw = imageFiles[i];
      items[i].status = "uploading";
      onProgress?.(items.slice());
      const baseName = raw.name.replace(/\.[^.]+$/, "").trim();
      const file = await resizeImageFile(raw);
      const ext = file.name.split(".").pop() || "bin";
      const { data: row, error } = await supabase.from("slider_images").insert({
        race_id: race.id,
        area: s.kind,
        section_id: s.id,
        position: nextPos++,
        status: "todo",
        title: baseName || null,
      }).select().single();
      if (error || !row) {
        items[i].status = "error";
        items[i].error = error?.message || "DB insert failed";
        onProgress?.(items.slice());
        continue;
      }
      const path = `${race.id}/${s.id}/${row.id}-${Date.now()}.${ext}`;
      try {
        await uploadFile("originals", path, file, file.type);
        await supabase.from("slider_images").update({
          original_path: path,
          original_size_kb: Math.round(file.size / 1000),
        }).eq("id", row.id);
        items[i].status = "done";
      } catch (e: any) {
        console.error("batch upload failed", file.name, e);
        items[i].status = "error";
        items[i].error = e?.message || "Upload failed";
      }
      onProgress?.(items.slice());
    }
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
            race.series === "f1" ? "bg-primary text-primary-foreground" :
            race.series === "motogp" ? "bg-foreground/90 text-background" :
            race.series === "dtm" ? "bg-amber-500 text-black" :
            "bg-red-600 text-white",
          )}>
            {race.series === "f1" ? "F1" : race.series === "motogp" ? "MotoGP" : race.series.toUpperCase()}
          </span>
          {canEdit && editingRaceName ? (
            <input
              autoFocus
              value={raceNameDraft}
              onChange={(e) => setRaceNameDraft(e.target.value)}
              onBlur={commitRaceName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRaceName();
                if (e.key === "Escape") {
                  setEditingRaceName(false);
                  setRaceNameDraft(race.name);
                }
              }}
              className="min-w-0 max-w-[min(100%,20rem)] truncate rounded border border-border bg-background px-2 py-0.5 font-display text-lg font-black uppercase tracking-tight text-foreground focus:border-primary focus:outline-none"
            />
          ) : canEdit ? (
            <button
              type="button"
              onClick={() => {
                setRaceNameDraft(race.name);
                setEditingRaceName(true);
              }}
              className="min-w-0 truncate text-left font-display text-lg font-black uppercase tracking-tight hover:text-primary"
              title="Rename race"
            >
              {race.name}
            </button>
          ) : (
            <h2 className="truncate font-display text-lg font-black uppercase tracking-tight">{race.name}</h2>
          )}
          {!open && hasChanges && (
            <span title="Changes pending" className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[#CB4F10]" />
          )}
          {!open && hasOpenComments && (
            <span title="Open comments" className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[#FACC15]" />
          )}
          {!open && hasSolved && (
            <span title="Comments solved" className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--status-solved)]" />
          )}
          {race.race_date && (
            <span className="hidden text-xs text-muted-foreground sm:inline">{race.race_date}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canEdit && (
            <>
              <Button size="sm" variant="ghost" onClick={() => addSection("plp")} className="h-7 gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> PLP
              </Button>
              <Button size="sm" variant="ghost" onClick={() => addSection("pdp")} className="h-7 gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> PDP
              </Button>
              <button
                onClick={() => onRequestDeleteRace(race)}
                className="rounded p-2 text-muted-foreground hover:bg-background hover:text-destructive"
                title="Delete race"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </header>

      {open && (
        <div className="space-y-3 p-4">
          {sorted.length === 0 && (
            <div className="grid h-[80px] place-items-center rounded border border-dashed border-border text-xs text-muted-foreground">
              No sections yet — add a PLP or PDP section above.
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
                canEdit={canEdit}
                onToggleSelect={onToggleSelect}
                onReload={onReload}
                onRename={(n) => renameSection(s, n)}
                onSetLinks={(links) => setSectionLinks(s, links)}
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
                onBatchUpload={(files, onProgress) => batchUploadToSection(s, files, onProgress)}
                onExport={onExport}
                onCompress={onCompress}
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
  canEdit,
  onToggleSelect,
  onReload,
  onRename,
  onSetLinks,
  onDelete,
  onAddSlot,
  onDragStart,
  onDropOn,
  isSectionDragging,
  onSectionDragStart,
  onSectionDragEnd,
  onSectionDropOn,
  onBatchUpload,
  onExport,
  onCompress,
}: {
  section: SliderSection;
  images: SliderImage[];
  selected: Set<string>;
  canEdit: boolean;
  onToggleSelect: (id: string) => void;
  onReload: () => void;
  onRename: (name: string) => void;
  onSetLinks: (links: SectionLink[]) => void;
  onDelete: () => void;
  onAddSlot: () => void;
  onDragStart: (id: string) => void;
  onDropOn: (targetId: string, side: "before" | "after") => void;
  isSectionDragging: boolean;
  onSectionDragStart: () => void;
  onSectionDragEnd: () => void;
  onSectionDropOn: (side: "before" | "after") => void;
  onBatchUpload: (files: File[], onProgress?: (items: BatchItem[]) => void) => Promise<void> | void;
  onExport: (images: SliderImage[]) => void;
  onCompress: (images: SliderImage[]) => void;
}) {
  const links: SectionLink[] = Array.isArray(section.external_links) ? section.external_links : [];
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(section.name);
  const [editingLinks, setEditingLinks] = useState(false);
  const [linksDraft, setLinksDraft] = useState<SectionLink[]>(links);
  const [sectionDropSide, setSectionDropSide] = useState<"before" | "after" | null>(null);
  const [fileHover, setFileHover] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [images.length]);

  useEffect(() => {
    if (images.length === 0) {
      setHasOpenComments(false);
      return;
    }
    let alive = true;
    const ids = images.map((i) => i.id);
    const refetch = async () => {
      const { count } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .in("image_id", ids)
        .is("resolved_at", null);
      if (alive) setHasOpenComments((count ?? 0) > 0);
    };
    refetch();
    const channel = supabase
      .channel(`section-comments-${section.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, (payload) => {
        const row = (payload.new ?? payload.old) as { image_id?: string } | null;
        if (row?.image_id && ids.includes(row.image_id)) refetch();
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [images, section.id]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" });
  };

  const [uploading, setUploading] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [hasOpenComments, setHasOpenComments] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  function commitName() {
    setEditingName(false);
    onRename(nameDraft);
  }
  function openLinksEditor() {
    setLinksDraft(links.length ? links : [{ label: "Originals", url: "" }]);
    setEditingLinks(true);
  }
  function commitLinks() {
    const cleaned = linksDraft
      .map((l) => ({ label: l.label.trim() || "Link", url: l.url.trim() }))
      .filter((l) => l.url);
    setEditingLinks(false);
    onSetLinks(cleaned);
  }

  const clearFileHover = () => setFileHover(false);

  useEffect(() => {
    window.addEventListener("dragend", clearFileHover);
    return () => window.removeEventListener("dragend", clearFileHover);
  }, []);

  return (
    <div
      ref={rootRef}
      onDragEnter={(e) => {
        if (!canEdit) return;
        if (dataTransferHasFiles(e.dataTransfer)) {
          e.preventDefault();
          e.stopPropagation();
          setFileHover(true);
        }
      }}
      onDragOver={(e) => {
        if (!canEdit) return;
        const types = e.dataTransfer.types;
        if (dataTransferHasFiles(e.dataTransfer)) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
          if (!fileHover) setFileHover(true);
          return;
        }
        if (types.includes("application/x-slider-image")) return;
        e.preventDefault();
        const r = rootRef.current?.getBoundingClientRect();
        if (!r) return;
        setSectionDropSide(e.clientY < r.top + r.height / 2 ? "before" : "after");
      }}
      onDragLeave={(e) => {
        const related = e.relatedTarget as Node | null;
        if (related && rootRef.current?.contains(related)) return;
        setFileHover(false);
        if (e.currentTarget === e.target) {
          setSectionDropSide(null);
        }
      }}
      onDrop={async (e) => {
        if (!canEdit) return;
        if (dataTransferHasFiles(e.dataTransfer)) {
          e.preventDefault();
          e.stopPropagation();
          setFileHover(false);
          const files = await collectFilesFromDataTransfer(e.dataTransfer);
          const images = files.filter(isImageFile);
          if (images.length === 0) return;
          setUploading(true);
          setBatchItems(images.map((f) => ({ name: f.name, status: "pending" as const })));
          try {
            await onBatchUpload(images, (items) => setBatchItems(items));
          } finally {
            setUploading(false);
            setTimeout(() => setBatchItems([]), 4000);
          }
          return;
        }
        if (sectionDropSide) {
          e.preventDefault();
          const side = sectionDropSide;
          setSectionDropSide(null);
          onSectionDropOn(side);
        }
      }}
      className={cn(
        "relative rounded border bg-background/30 transition",
        fileHover ? "border-primary ring-2 ring-primary/40" : "border-border/60",
        isSectionDragging && "opacity-50",
      )}
    >
      {sectionDropSide && (
        <div
          className={cn(
            "pointer-events-none absolute left-0 z-20 h-1 w-full bg-primary",
            sectionDropSide === "before" ? "top-0" : "bottom-0",
          )}
        />
      )}
      {fileHover && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded bg-primary/10 text-xs font-bold uppercase tracking-wider text-primary">
          Drop folder/images here
        </div>
      )}
      {(uploading || batchItems.length > 0) && (() => {
        const total = batchItems.length;
        const done = batchItems.filter((i) => i.status === "done").length;
        const errored = batchItems.filter((i) => i.status === "error").length;
        const pct = total === 0 ? 0 : Math.round(((done + errored) / total) * 100);
        return (
          <div className="absolute inset-x-2 top-2 z-30 max-h-[80%] overflow-hidden rounded-md border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold">
              <span>{uploading ? "Uploading…" : "Upload complete"}</span>
              <span className="text-muted-foreground">{done + errored}/{total} ({pct}%)</span>
            </div>
            <div className="mb-2 h-2 w-full overflow-hidden rounded bg-muted">
              <div
                className={cn("h-full transition-all", errored > 0 ? "bg-destructive" : "bg-primary")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <ul className="max-h-40 space-y-0.5 overflow-auto text-[11px]">
              {batchItems.map((it, idx) => (
                <li key={idx} className="flex items-center justify-between gap-2 truncate">
                  <span className="truncate" title={it.name}>{it.name}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      it.status === "done" && "bg-emerald-500/15 text-emerald-600",
                      it.status === "uploading" && "bg-primary/15 text-primary",
                      it.status === "pending" && "bg-muted text-muted-foreground",
                      it.status === "error" && "bg-destructive/15 text-destructive",
                    )}
                    title={it.error}
                  >
                    {it.status === "done" && "Done"}
                    {it.status === "uploading" && "Uploading…"}
                    {it.status === "pending" && "Pending"}
                    {it.status === "error" && "Error"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}
      {sectionDropSide && (
        <div
          className={cn(
            "pointer-events-none absolute left-0 z-20 h-1 w-full bg-primary",
            sectionDropSide === "before" ? "top-0" : "bottom-0",
          )}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {canEdit ? (
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", `section:${section.id}`);
                onSectionDragStart();
              }}
              onDragEnd={onSectionDragEnd}
              title="Move section"
              className="grid h-5 w-5 cursor-grab place-items-center rounded text-muted-foreground hover:text-primary active:cursor-grabbing"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          ) : (
            <div className="h-5 w-5" />
          )}
          <span className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest",
            section.kind === "plp" ? "bg-primary/15 text-primary" : "bg-foreground/10 text-foreground",
          )}>
            {section.kind}
          </span>
          {images.some((i) => i.status === "changes") && (
            <span
              title="Changes pending"
              className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[#CB4F10]"
            />
          )}
          {hasOpenComments && (
            <span
              title="Open comments"
              className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[#FACC15]"
            />
          )}
          {images.some((i) => i.status === "solved") && (
            <span
              title="Comments solved"
              className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--status-solved)]"
            />
          )}
          {canEdit && editingName ? (
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
          ) : canEdit ? (
            <button
              onClick={() => { setNameDraft(section.name); setEditingName(true); }}
              className="font-display text-xs font-black uppercase tracking-widest text-foreground hover:text-primary"
              title="Rename section"
            >
              {section.name}
            </button>
          ) : (
            <span className="font-display text-xs font-black uppercase tracking-widest text-foreground">
              {section.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {links.map((l, idx) => (
            <a
              key={idx}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-[160px] items-center gap-1 truncate rounded border border-border bg-background px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-primary hover:border-primary"
              title={l.url}
            >
              <ExternalLink className="h-3 w-3 shrink-0" /> <span className="truncate">{l.label}</span>
            </a>
          ))}
          {canEdit && (
            <button
              onClick={openLinksEditor}
              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-primary"
              title={links.length ? "Edit links" : "Add external links"}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost"
              disabled={images.filter(isCompressEligible).length === 0}
              onClick={() => onCompress(images.filter(isCompressEligible))}
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary disabled:opacity-40"
              title={`Compress ${section.kind.toUpperCase()} images`}>
              <Wand2 className="h-3.5 w-3.5" /> Compress
            </Button>
          )}
          <Button size="sm" variant="ghost"
            disabled={images.filter((i) => i.compressed_path).length === 0}
            onClick={() => onExport(images.filter((i) => i.compressed_path))}
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary disabled:opacity-40"
            title={`Export ${section.kind.toUpperCase()} images`}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          {canEdit && (
            <>
              <Button size="sm" variant="ghost" onClick={onAddSlot}
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary">
                <Plus className="h-3.5 w-3.5" /> Slot
              </Button>
              <button
                onClick={onDelete}
                className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                title="Delete section"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="relative">
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto scroll-smooth p-3">
          {images.length === 0 && (
            <div className="grid h-[120px] w-full place-items-center text-xs text-muted-foreground">
              {canEdit ? "Drop images here via drag & drop" : "No images in this section yet"}
            </div>
          )}
          {images.map((img) => (
            <ImageCell
              key={img.id}
              image={img}
              canEdit={canEdit}
              selected={selected.has(img.id)}
              onToggleSelect={() => onToggleSelect(img.id)}
              onChanged={onReload}
              onDragStart={() => onDragStart(img.id)}
              onDropBefore={() => onDropOn(img.id, "before")}
              onDropAfter={() => onDropOn(img.id, "after")}
              onCompress={() => onCompress([img])}
              onFileDropHandled={clearFileHover}
              onMultiFileDrop={async (files) => {
                clearFileHover();
                setUploading(true);
                setBatchItems(files.map((f) => ({ name: f.name, status: "pending" as const })));
                try {
                  await onBatchUpload(files, (items) => setBatchItems(items));
                } finally {
                  setUploading(false);
                  setTimeout(() => setBatchItems([]), 4000);
                }
              }}
            />
          ))}
        </div>
        {canScrollLeft && (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-surface-2 to-transparent" />
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label="Scroll left"
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full border border-border bg-background/90 text-foreground shadow-md backdrop-blur transition hover:bg-background hover:text-primary"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </>
        )}
        {canScrollRight && (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-surface-2 to-transparent" />
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label="Scroll right"
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full border border-border bg-background/90 text-foreground shadow-md backdrop-blur transition hover:bg-background hover:text-primary"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>


      {editingLinks && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur"
          onClick={() => setEditingLinks(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-lg border border-border bg-surface-2 p-4 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-black uppercase tracking-widest">
                External links — {section.name}
              </h3>
              <button
                onClick={() => setEditingLinks(false)}
                className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {linksDraft.length === 0 && (
                <div className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  No links yet — add the first one below.
                </div>
              )}
              {linksDraft.map((l, idx) => (
                <div key={idx} className="grid grid-cols-[140px_minmax(0,1fr)_auto] gap-2">
                  <input
                    type="text"
                    placeholder="Label"
                    value={l.label}
                    onChange={(e) => {
                      const next = linksDraft.slice();
                      next[idx] = { ...next[idx], label: e.target.value };
                      setLinksDraft(next);
                    }}
                    className="rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                  />
                  <input
                    type="url"
                    placeholder="https://…"
                    value={l.url}
                    onChange={(e) => {
                      const next = linksDraft.slice();
                      next[idx] = { ...next[idx], url: e.target.value };
                      setLinksDraft(next);
                    }}
                    className="rounded border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => setLinksDraft(linksDraft.filter((_, i) => i !== idx))}
                    className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-destructive"
                    title="Remove link"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLinksDraft([...linksDraft, { label: "", url: "" }])}
                className="gap-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Add link
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditingLinks(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={commitLinks}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


