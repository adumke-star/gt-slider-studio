import { useEffect, useRef, useState } from "react";
import { Trash2, Upload, Image as ImageIcon, Check, Download, GripVertical, MessageSquare, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl, uploadFile, removeFile } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { collectFilesFromDataTransfer, dataTransferHasFiles, isImageFile } from "@/lib/dropFiles";
import { CommentsSheet } from "./CommentsSheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type SliderImage = {
  id: string;
  race_id: string;
  area: "plp" | "pdp";
  section_id: string | null;
  position: number;
  status: "live" | "image_done" | "todo" | "blank" | "changes";
  title: string | null;
  original_path: string | null;
  compressed_path: string | null;
  compressed_url: string | null;
  original_size_kb: number | null;
  compressed_size_kb: number | null;
  format: string | null;
};

const STATUS_ORDER: SliderImage["status"][] = ["todo", "changes", "image_done", "live"];

const STATUS_META: Record<SliderImage["status"], { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-[var(--status-live)]/15 text-[var(--status-live)] border-[var(--status-live)]/40" },
  image_done: { label: "Image done", cls: "bg-primary/15 text-primary border-primary/40" },
  changes: { label: "Changes", cls: "bg-[var(--status-changes)]/15 text-[var(--status-changes)] border-[var(--status-changes)]/40" },
  todo: { label: "To do", cls: "bg-[var(--status-todo)]/15 text-[var(--status-todo)] border-[var(--status-todo)]/40" },
  blank: { label: "To do", cls: "bg-[var(--status-todo)]/15 text-[var(--status-todo)] border-[var(--status-todo)]/40" },
};

export function slugifyName(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function ImageCell({
  image,
  selected,
  onToggleSelect,
  onChanged,
  onDragStart,
  onDropBefore,
  onDropAfter,
  onMultiFileDrop,
}: {
  image: SliderImage;
  selected: boolean;
  onToggleSelect: () => void;
  onChanged: () => void;
  onDragStart: () => void;
  onDropBefore: () => void;
  onDropAfter: () => void;
  onMultiFileDrop?: (files: File[]) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(image.title ?? "");
  const [dropSide, setDropSide] = useState<"left" | "right" | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [unreadMentions, setUnreadMentions] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setName(image.title ?? ""); }, [image.title]);



  useEffect(() => {
    let alive = true;
    (async () => {
      const path = image.compressed_path || image.original_path;
      if (!path) return setPreview(null);
      const bucket = image.compressed_path ? "compressed" : "originals";
      const url = await signedUrl(bucket, path);
      if (alive) setPreview(url);
    })();
    return () => { alive = false; };
  }, [image.compressed_path, image.original_path]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const { count } = await supabase.from("comments")
        .select("id", { count: "exact", head: true }).eq("image_id", image.id).is("resolved_at", null);
      if (alive) setCommentCount(count ?? 0);
      if (u.user) {
        const { data: cs } = await supabase.from("comments").select("id").eq("image_id", image.id).is("resolved_at", null);
        const ids = (cs ?? []).map((c) => c.id);
        if (ids.length > 0) {
          const { count: unread } = await supabase.from("comment_mentions")
            .select("id", { count: "exact", head: true })
            .in("comment_id", ids).eq("mentioned_user_id", u.user.id).is("read_at", null);
          if (alive) setUnreadMentions(unread ?? 0);
        } else if (alive) setUnreadMentions(0);
      }
    })();
    return () => { alive = false; };
  }, [image.id, commentsOpen]);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const baseName = file.name.replace(/\.[^.]+$/, "").trim();
      const folder = image.section_id ?? image.area;
      const path = `${image.race_id}/${folder}/${image.id}-${Date.now()}.${ext}`;
      await uploadFile("originals", path, file, file.type);
      if (image.original_path) await removeFile("originals", image.original_path);
      await supabase.from("slider_images").update({
        original_path: path,
        original_size_kb: Math.round(file.size / 1024),
        title: baseName || image.title,
        status: image.status === "blank" ? "todo" : image.status,
      }).eq("id", image.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      if (image.original_path) await removeFile("originals", image.original_path);
      if (image.compressed_path) await removeFile("compressed", image.compressed_path);
      await supabase.from("slider_images").update({
        original_path: null, compressed_path: null, compressed_url: null,
        original_size_kb: null, compressed_size_kb: null, format: null,
        status: "todo",
      }).eq("id", image.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: SliderImage["status"]) {
    if (status === image.status) return;
    await supabase.from("slider_images").update({ status }).eq("id", image.id);
    onChanged();
  }

  async function saveName() {
    const trimmed = name.trim();
    if ((trimmed || null) === image.title) return;
    await supabase.from("slider_images").update({ title: trimmed || null }).eq("id", image.id);
    onChanged();
  }

  function downloadName(ext: string) {
    const slug = slugifyName(name);
    const base = slug || `${image.area}-${String(image.position).padStart(2, "0")}-${image.id.slice(0, 6)}`;
    return `${base}.${ext}`;
  }

  const meta = STATUS_META[image.status];

  return (
    <div
      ref={rootRef}
      onDragOver={(e) => {
        e.preventDefault();
        // Side detection only when moving an image, not a file
        if (dataTransferHasFiles(e.dataTransfer)) {
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
          setDropSide(null);
          return;
        }
        const r = rootRef.current?.getBoundingClientRect();
        if (!r) return;
        setDropSide(e.clientX < r.left + r.width / 2 ? "left" : "right");
      }}
      onDragLeave={() => setDropSide(null)}
      onDrop={async (e) => {
        if (dataTransferHasFiles(e.dataTransfer)) {
          e.preventDefault();
          e.stopPropagation();
          setDropSide(null);
          const arr = (await collectFilesFromDataTransfer(e.dataTransfer)).filter(isImageFile);
          if (arr.length > 1 && onMultiFileDrop) {
            onMultiFileDrop(arr);
          } else if (arr.length >= 1) {
            handleFile(arr[0]);
          }
          return;
        }
        e.preventDefault();
        const side = dropSide;
        setDropSide(null);
        if (side === "left") onDropBefore();
        else onDropAfter();
      }}
      className={cn(
        "group relative flex w-[180px] shrink-0 flex-col overflow-hidden rounded-md border transition",
        image.status === "changes" ? "bg-[#CB4F10]/20 border-[#CB4F10]/50" : "bg-surface-2 border-border hover:border-primary/40",
        selected ? "ring-2 ring-primary/40" : "",
      )}
    >
      {dropSide && (
        <div
          className={cn(
            "pointer-events-none absolute top-0 z-20 h-full w-1 bg-primary",
            dropSide === "left" ? "left-0" : "right-0",
          )}
        />
      )}

      <label className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-border bg-background/80 backdrop-blur">
        <input type="checkbox" className="peer sr-only" checked={selected} onChange={onToggleSelect} />
        {selected && <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} />}
      </label>

      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", image.id); e.dataTransfer.setData("application/x-slider-image", image.id); onDragStart(); }}
        title="Drag to reorder"
        className="absolute right-1.5 top-1.5 z-10 grid h-5 w-5 cursor-grab place-items-center rounded border border-border bg-background/80 text-muted-foreground backdrop-blur active:cursor-grabbing"
      >
        <GripVertical className="h-3 w-3" />
      </div>

      <div className="relative aspect-[633/382] w-full overflow-hidden bg-background">
        {preview ? (
          <img src={preview} alt={image.title ?? ""} className="h-full w-full object-cover" />
        ) : (
          <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary">
            <ImageIcon className="h-6 w-6" />
            <span className="text-[10px] uppercase tracking-wider">Drop / click</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-background/70 text-xs text-primary">
            Working…
          </div>
        )}
      </div>

      <div className="px-2 pt-1.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="Bildname…"
          className="w-full rounded border border-border bg-background/50 px-1.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-between gap-1 px-2 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition hover:scale-105",
                meta.cls,
              )}
            >
              {meta.label}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[8rem]">
            {STATUS_ORDER.map((s) => {
              const m = STATUS_META[s];
              return (
                <DropdownMenuItem
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 text-xs",
                    s === image.status && "font-semibold",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", m.cls.replace(/border-\S+/g, "").replace(/text-\S+/g, "").replace(/bg-\[/g, "bg-[").replace(/\/15/g, ""))} />
                  {m.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCommentsOpen(true)}
            title="Kommentare"
            className="relative rounded p-1 text-muted-foreground hover:bg-background hover:text-primary"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {commentCount > 0 && (
              <span className={cn(
                "absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full px-1 text-[8px] font-bold",
                unreadMentions > 0 ? "bg-destructive text-white" : "bg-primary text-primary-foreground",
              )}>{unreadMentions > 0 ? unreadMentions : commentCount}</span>
            )}
          </button>
          {image.compressed_path && (
            <button
              onClick={async () => {
                const url = await signedUrl("compressed", image.compressed_path!);
                if (!url) return;
                const blob = await (await fetch(url)).blob();
                const ext = image.format ? (image.format === "jpeg" ? "jpg" : image.format) : "webp";
                const a = document.createElement("a");
                const objUrl = URL.createObjectURL(blob);
                a.href = objUrl; a.download = downloadName(ext); document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
              }}
              title="Download compressed"
              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-primary"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
          <label className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-background hover:text-primary">
            <Upload className="h-3.5 w-3.5" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
          <button
            onClick={handleRemove}
            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {(image.compressed_size_kb || image.original_size_kb) && (
        <div className="border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
          {image.compressed_size_kb
            ? <>Web: <span className="text-primary">{image.compressed_size_kb} KB</span> · {image.format?.toUpperCase()}</>
            : <>Orig: {image.original_size_kb} KB</>}
        </div>
      )}

      <CommentsSheet image={image} open={commentsOpen} onOpenChange={setCommentsOpen} />
    </div>
  );
}
