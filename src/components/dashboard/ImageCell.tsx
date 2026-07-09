import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Trash2, Upload, Image as ImageIcon, Check, Download, GripVertical, MessageSquare, ChevronDown, Wand2, Crop, FileCheck2, Link2, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { downloadFile, loadImagePreview, isBlobPreviewUrl, signedUrl, uploadFile, removeFile } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { collectFilesFromDataTransfer, dataTransferHasFiles, isImageFile } from "@/lib/dropFiles";
import { CommentsSheet } from "./CommentsSheet";
import { CropDialog } from "./CropDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { hasCustomCrop, hasCustomCropArea, parseCropArea, renderCroppedPreviewUrl } from "@/lib/cropUtils";
import { acceptWithoutCompression, isCompressEligible } from "@/lib/compressImage";
import { IMAGE_TYPE_SUGGESTIONS, imageTypeLabel, normalizeImageType } from "@/lib/rules";
import { STATUS_META } from "@/lib/bulkImageStatus";

export type SliderImage = {
  id: string;
  race_id: string;
  area: "plp" | "pdp";
  section_id: string | null;
  position: number;
  status: "live" | "image_done" | "todo" | "blank" | "changes" | "exported" | "solved";
  title: string | null;
  original_path: string | null;
  compressed_path: string | null;
  compressed_url: string | null;
  original_size_kb: number | null;
  compressed_size_kb: number | null;
  format: string | null;
  crop_area?: unknown;
  crop_x?: number | null;
  crop_y?: number | null;
  image_type?: string | null;
  season?: number | null;
  created_at?: string;
  is_placeholder?: boolean;
  placeholder_label?: string | null;
  placeholder_group_id?: string | null;
};

const STATUS_ORDER: SliderImage["status"][] = ["todo", "changes", "solved", "image_done", "exported", "live"];

export function slugifyName(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function ImageCell({
  image,
  selected,
  canEdit,
  groupSize = 1,
  groupIndex = 1,
  onToggleSelect,
  onUnlink,
  onChanged,
  onDragStart,
  onDropBefore,
  onDropAfter,
  onMultiFileDrop,
  onFileDropHandled,
  onCompress,
}: {
  image: SliderImage;
  selected: boolean;
  canEdit: boolean;
  groupSize?: number;
  groupIndex?: number;
  onToggleSelect: () => void;
  onUnlink?: () => void;
  onChanged: () => void;
  onDragStart: () => void;
  onDropBefore: () => void;
  onDropAfter: () => void;
  onMultiFileDrop?: (files: File[]) => void;
  onFileDropHandled?: () => void;
  onCompress?: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [previewMissing, setPreviewMissing] = useState(false);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(image.title ?? "");
  const [typeDraft, setTypeDraft] = useState(imageTypeLabel(image.image_type));
  const [dropSide, setDropSide] = useState<"left" | "right" | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [unreadMentions, setUnreadMentions] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setName(image.title ?? ""); }, [image.title]);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    (async () => {
      const path = image.compressed_path || image.original_path;
      if (!path) {
        if (alive) {
          setPreview(null);
          setPreviewMissing(false);
        }
        return;
      }
      const bucket = image.compressed_path ? "compressed" : "originals";
      const url = await loadImagePreview(bucket, path);
      if (!alive) {
        if (url && isBlobPreviewUrl(url)) URL.revokeObjectURL(url);
        return;
      }
      if (url && isBlobPreviewUrl(url)) objectUrl = url;
      setPreview(url);
      setPreviewMissing(!url);
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.compressed_path, image.original_path, image.id]);

  const cropArea = parseCropArea(image.crop_area);
  const showCropPreview = Boolean(preview && image.original_path && !image.compressed_path);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!preview || !showCropPreview || !cropArea) {
        if (alive) setCroppedPreview(null);
        return;
      }
      const url = await renderCroppedPreviewUrl(preview, cropArea);
      if (alive) setCroppedPreview(url);
    })();
    return () => { alive = false; };
  }, [preview, showCropPreview, image.crop_area]);

  useEffect(() => {
    setTypeDraft(imageTypeLabel(image.image_type));
  }, [image.image_type]);

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

  async function handleFile(rawFile: File) {
    setBusy(true);
    try {
      const baseName = rawFile.name.replace(/\.[^.]+$/, "").trim();
      const { resizeImageFile } = await import("@/lib/imageResize");
      const file = await resizeImageFile(rawFile);
      const ext = file.name.split(".").pop() || "bin";
      const folder = image.section_id ?? image.area;
      const path = `${image.race_id}/${folder}/${image.id}-${Date.now()}.${ext}`;
      await uploadFile("originals", path, file, file.type);
      if (image.original_path) await removeFile("originals", image.original_path);
      await supabase.from("slider_images").update({
        original_path: path,
        original_size_kb: Math.round(file.size / 1000),
        crop_area: null,
        crop_x: null,
        crop_y: null,
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
      await Promise.allSettled([
        image.original_path ? removeFile("originals", image.original_path) : Promise.resolve(),
        image.compressed_path ? removeFile("compressed", image.compressed_path) : Promise.resolve(),
      ]);
      await supabase.from("slider_images").update({
        original_path: null, compressed_path: null, compressed_url: null,
        original_size_kb: null, compressed_size_kb: null, format: null,
        crop_area: null,
        crop_x: null, crop_y: null,
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

  async function acceptAsFinal() {
    setBusy(true);
    try {
      const result = await acceptWithoutCompression(image);
      switch (result.outcome) {
        case "ok":
          toast.success("Image accepted without re-compression — ready to export.");
          onChanged();
          break;
        case "already-final":
          toast.info("Image is already exportable.");
          break;
        case "missing":
          toast.error("Image file not found in storage. Try re-uploading.");
          break;
        case "unsupported":
          toast.error(`Format "${result.mime}" is not supported for export. Use Compress instead.`);
          break;
        case "failed":
          toast.error(`Could not save: ${result.message}`);
          break;
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveImageType(raw: string) {
    const trimmed = raw.trim();
    // Store the canonical key for rule-relevant types, free text otherwise.
    const known = normalizeImageType(trimmed);
    const value = trimmed === "" ? null : (known ?? trimmed);
    if (value === (image.image_type ?? null)) return;
    const { error } = await supabase.from("slider_images").update({ image_type: value }).eq("id", image.id);
    if (error) {
      toast.error(`Could not save image type: ${error.message}`);
      return;
    }
    onChanged();
  }

  async function saveSeason(raw: string) {
    const parsed = raw.trim() === "" ? null : Number(raw.trim());
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100)) return;
    if (parsed === (image.season ?? null)) return;
    const { error } = await supabase.from("slider_images").update({ season: parsed }).eq("id", image.id);
    if (error) {
      toast.error(`Could not save season: ${error.message}`);
      return;
    }
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
  const cropAdjusted = hasCustomCropArea(cropArea) || hasCustomCrop(image.crop_x, image.crop_y);
  const canCrop = Boolean(image.original_path && !image.compressed_path && preview);
  const displayPreview = croppedPreview ?? preview;
  const isGrouped = groupSize > 1;

  return (
    <div
      ref={rootRef}
      onDragOver={(e) => {
        if (!canEdit) return;
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
        if (!canEdit) return;
        if (dataTransferHasFiles(e.dataTransfer)) {
          e.preventDefault();
          e.stopPropagation();
          setDropSide(null);
          onFileDropHandled?.();
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
        image.status === "changes" ? "bg-[#CB4F10]/20 border-[#CB4F10]/50" :
        image.status === "solved" ? "bg-[var(--status-solved)]/20 border-[var(--status-solved)]/50" :
        image.status === "image_done" ? "bg-[#D4A843]/20 border-[#D4A843]/50" : "bg-surface-2 border-border hover:border-primary/40",
        isGrouped && "ring-2 ring-white/25 ring-offset-1 ring-offset-transparent",
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

      {isGrouped && (
        <span
          className="absolute left-1.5 top-7 z-10 inline-flex items-center gap-0.5 rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-bold text-foreground backdrop-blur"
          title="Linked group — drag any member to move all together"
        >
          <Link2 className="h-2.5 w-2.5" />
          {groupIndex}/{groupSize}
        </span>
      )}

      {canEdit && (
        <div
          draggable
          onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", image.id); e.dataTransfer.setData("application/x-slider-image", image.id); onDragStart(); }}
          title={isGrouped ? "Drag to move linked group" : "Drag to reorder"}
          className={cn(
            "absolute top-1.5 z-10 grid h-5 w-5 cursor-grab place-items-center rounded border border-border bg-background/80 text-muted-foreground backdrop-blur active:cursor-grabbing",
            isGrouped && onUnlink ? "right-8" : "right-1.5",
          )}
        >
          <GripVertical className="h-3 w-3" />
        </div>
      )}

      {canEdit && isGrouped && onUnlink && (
        <button
          type="button"
          onClick={onUnlink}
          title="Remove from group"
          className="absolute right-1.5 top-1.5 z-10 grid h-5 w-5 place-items-center rounded border border-border bg-background/80 text-muted-foreground backdrop-blur hover:text-primary"
        >
          <Unlink className="h-3 w-3" />
        </button>
      )}

      <div className="relative aspect-[633/382] w-full overflow-hidden bg-background">
        {displayPreview ? (
          <img
            src={displayPreview}
            alt={image.title ?? ""}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
            <span className="text-[10px] uppercase tracking-wider">
              {previewMissing && (image.original_path || image.compressed_path)
                ? "File missing"
                : canEdit
                  ? "Drop / click"
                  : "Empty slot"}
            </span>
            {canEdit && (
              <label className="absolute inset-0 cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
            )}
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-background/70 text-xs text-primary">
            Working…
          </div>
        )}
        {cropAdjusted && showCropPreview && (
          <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary backdrop-blur">
            Crop
          </span>
        )}
      </div>

      <div className="px-2 pt-1.5">
        {canEdit ? (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="Image name…"
            className="w-full rounded border border-border bg-background/50 px-1.5 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        ) : (
          <div className="truncate px-0.5 py-1 text-[11px] text-foreground" title={name || undefined}>
            {name || "Untitled"}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 px-2 py-1.5">
        {canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-1 self-start rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition hover:scale-105",
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
                    {m.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className={cn(
            "flex items-center gap-1 self-start rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            meta.cls,
          )}>
            {meta.label}
          </span>
        )}
        <div className="flex items-center gap-1">
          {canEdit ? (
            <TypeCombobox
              value={typeDraft}
              onChange={setTypeDraft}
              onCommit={saveImageType}
              onCancel={() => setTypeDraft(imageTypeLabel(image.image_type))}
              suggestions={IMAGE_TYPE_SUGGESTIONS}
            />
          ) : (
            image.image_type && (
              <span className="truncate rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {imageTypeLabel(image.image_type)}
              </span>
            )
          )}
          {canEdit ? (
            <SeasonPicker
              value={image.season ?? null}
              onCommit={(year) => saveSeason(year === null ? "" : String(year))}
            />
          ) : (
            image.season && (
              <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {image.season}
              </span>
            )
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCommentsOpen(true)}
            title="Comments"
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
          {canEdit && canCrop && (
            <button
              onClick={() => setCropOpen(true)}
              title="Adjust crop"
              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-primary"
            >
              <Crop className="h-3.5 w-3.5" />
            </button>
          )}
          {canEdit && isCompressEligible(image) && onCompress && (
            <button
              onClick={onCompress}
              title="Compress image"
              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-primary"
            >
              <Wand2 className="h-3.5 w-3.5" />
            </button>
          )}
          {canEdit && image.original_path && (
            <button
              onClick={acceptAsFinal}
              disabled={busy}
              title="Already compressed — accept as final without re-compression"
              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-primary disabled:opacity-40"
            >
              <FileCheck2 className="h-3.5 w-3.5" />
            </button>
          )}
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
          {canEdit && (
            <>
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
            </>
          )}
        </div>
      </div>

      {(image.compressed_size_kb || image.original_size_kb) && (
        <div className="border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
          {image.compressed_size_kb
            ? <>Web: <span className="text-primary">{image.compressed_size_kb} KB</span> · {image.format?.toUpperCase()}</>
            : <>Orig: {image.original_size_kb} KB</>}
        </div>
      )}

      <CommentsSheet image={image} open={commentsOpen} onOpenChange={setCommentsOpen} onChanged={onChanged} />
      {canCrop && preview && (
        <CropDialog
          key={image.id}
          image={image}
          previewUrl={preview}
          open={cropOpen}
          onOpenChange={setCropOpen}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}

const SEASON_YEAR_SPAN = 12;

function seasonYearOptions(selected: number, currentYear: number): number[] {
  const min = Math.min(selected, currentYear) - SEASON_YEAR_SPAN;
  const max = Math.max(selected, currentYear) + 4;
  const years: number[] = [];
  for (let y = min; y <= max; y++) years.push(y);
  return years;
}

/** Year picker for the season field — defaults to the current calendar year. */
function SeasonPicker({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (year: number | null) => void;
}) {
  const currentYear = new Date().getFullYear();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const skipBlurCommit = useRef(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? currentYear);
  const [rect, setRect] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(
    null,
  );

  const years = seasonYearOptions(draft, currentYear);

  useEffect(() => {
    if (!open) setDraft(value ?? currentYear);
  }, [value, currentYear, open]);

  useEffect(() => {
    if (!open) return;
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, [open, draft]);

  const updateRect = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < 170) {
      setRect({ bottom: window.innerHeight - r.top + 2, left: r.left, width: Math.max(r.width, 56) });
    } else {
      setRect({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 56) });
    }
  };

  useEffect(() => {
    if (!rect) return;
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [rect !== null]);

  function bumpYear(delta: number) {
    setDraft((y) => {
      const idx = years.indexOf(y);
      const next = years[Math.min(years.length - 1, Math.max(0, idx + delta))];
      return next ?? y + delta;
    });
  }

  function commitYear(year: number) {
    onCommit(year);
    setOpen(false);
    setRect(null);
  }

  function openPicker() {
    setDraft(value ?? currentYear);
    setOpen(true);
    updateRect();
  }

  const display = value?.toString() ?? "";

  return (
    <div className="shrink-0">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        readOnly
        value={open ? String(draft) : display}
        placeholder={String(currentYear)}
        onFocus={openPicker}
        onClick={openPicker}
        onBlur={() => {
          setOpen(false);
          setRect(null);
          if (skipBlurCommit.current) {
            skipBlurCommit.current = false;
            return;
          }
          commitYear(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            bumpYear(-1);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            bumpYear(1);
          }
          if (e.key === "Enter") {
            e.preventDefault();
            commitYear(draft);
            skipBlurCommit.current = true;
            inputRef.current?.blur();
          }
          if (e.key === "Escape") {
            setDraft(value ?? currentYear);
            setOpen(false);
            setRect(null);
            skipBlurCommit.current = true;
            inputRef.current?.blur();
          }
        }}
        onWheel={(e) => {
          e.preventDefault();
          bumpYear(e.deltaY > 0 ? 1 : -1);
        }}
        title="Season shown in the image (rules 3/4) — scroll or use arrow keys to change year"
        className="w-14 cursor-pointer rounded border border-border bg-background/50 px-1.5 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      {open && rect &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              width: rect.width,
            }}
            className="z-50 max-h-40 overflow-auto rounded border border-border bg-popover py-0.5 shadow-md"
            onWheel={(e) => {
              e.preventDefault();
              e.stopPropagation();
              bumpYear(e.deltaY > 0 ? 1 : -1);
            }}
          >
            {years.map((year) => (
              <button
                key={year}
                ref={year === draft ? selectedRef : undefined}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setDraft(year);
                  commitYear(year);
                  skipBlurCommit.current = true;
                  inputRef.current?.blur();
                }}
                className={cn(
                  "block w-full px-2 py-1 text-center text-[10px] hover:bg-accent hover:text-accent-foreground",
                  year === draft ? "bg-accent/80 font-semibold text-foreground" : "text-foreground",
                )}
              >
                {year}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Free-text input with a suggestion list. The list renders in a portal with
 * fixed positioning, so it is never clipped by the scrolling slot container.
 */
function TypeCombobox({
  value,
  onChange,
  onCommit,
  onCancel,
  suggestions,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  onCancel: () => void;
  suggestions: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommit = useRef(false);
  const [rect, setRect] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(
    null,
  );

  const updateRect = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // max-h-40 (160px) + margin; open upwards when the list would leave the viewport.
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < 170) {
      setRect({ bottom: window.innerHeight - r.top + 2, left: r.left, width: r.width });
    } else {
      setRect({ top: r.bottom + 2, left: r.left, width: r.width });
    }
  };

  useEffect(() => {
    if (!rect) return;
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [rect !== null]);

  const query = value.trim().toLowerCase();
  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(query) && s.toLowerCase() !== query,
  );

  return (
    <div className="min-w-0 flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={updateRect}
        onBlur={() => {
          setRect(null);
          if (skipBlurCommit.current) {
            skipBlurCommit.current = false;
            return;
          }
          onCommit(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            onCancel();
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Type…"
        title="Image type — Compositing / Race action / Fan atmosphere drive the rule checks, any other text is allowed"
        className="w-full rounded border border-border bg-background/50 px-1.5 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      {rect && filtered.length > 0 &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              minWidth: rect.width,
            }}
            className="z-50 max-h-40 w-max overflow-auto rounded border border-border bg-popover py-0.5 shadow-md"
          >
            {filtered.map((s) => (
              <button
                key={s}
                type="button"
                // onMouseDown so the click wins over the input blur
                onMouseDown={(e) => {
                  e.preventDefault();
                  setRect(null);
                  onChange(s);
                  onCommit(s);
                  skipBlurCommit.current = true;
                  inputRef.current?.blur();
                }}
                className="block w-full px-2 py-1 text-left text-[10px] text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {s}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
