import { useEffect, useRef, useState } from "react";
import { Check, GripVertical, Link2, Trash2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { findPlaceholderType, isProductVideoPlaceholder } from "@/lib/placeholderSlots";
import type { SliderImage } from "./ImageCell";

export function PlaceholderSlotCell({
  image,
  canEdit,
  selected,
  groupSize,
  groupIndex,
  onToggleSelect,
  onDelete,
  onUnlink,
  onDragStart,
  onDropBefore,
  onDropAfter,
  onChanged,
}: {
  image: SliderImage;
  canEdit: boolean;
  selected?: boolean;
  /** Total slots in this placeholder group (1 = not grouped). */
  groupSize: number;
  /** 1-based index within the group when grouped. */
  groupIndex: number;
  onToggleSelect?: () => void;
  onDelete: () => void;
  onUnlink?: () => void;
  onDragStart: () => void;
  onDropBefore: () => void;
  onDropAfter: () => void;
  onChanged?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dropSide, setDropSide] = useState<"left" | "right" | null>(null);
  const type = findPlaceholderType(image.placeholder_label);
  const Icon = type?.icon;
  const label = image.placeholder_label ?? "Placeholder";
  const isGrouped = groupSize > 1;
  const isProductVideo = isProductVideoPlaceholder(image.placeholder_label);
  const videoName = image.title?.trim() ?? "";

  return (
    <div
      ref={rootRef}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        const r = rootRef.current?.getBoundingClientRect();
        if (!r) return;
        setDropSide(e.clientX < r.left + r.width / 2 ? "left" : "right");
      }}
      onDragLeave={() => setDropSide(null)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        const side = dropSide;
        setDropSide(null);
        if (side === "left") onDropBefore();
        else onDropAfter();
      }}
      className={cn(
        "group relative flex w-[180px] shrink-0 flex-col overflow-hidden rounded-md border-2 border-dashed transition",
        type?.accent ?? "border-border bg-muted/50",
        isGrouped && "ring-2 ring-white/25 ring-offset-1 ring-offset-transparent",
        selected && "ring-2 ring-primary/50",
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

      <span className="absolute left-1.5 top-1.5 z-10 rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
        Placeholder
      </span>

      {isGrouped && (
        <span
          className="absolute left-1.5 top-7 z-10 inline-flex items-center gap-0.5 rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur"
          title="Linked group — drag any member to move all together"
        >
          <Link2 className="h-2.5 w-2.5" />
          {groupIndex}/{groupSize}
        </span>
      )}

      {canEdit && onToggleSelect && (
        <label
          className={cn(
            "absolute bottom-1.5 left-1.5 z-10 grid h-5 w-5 cursor-pointer place-items-center rounded border border-border bg-background/80 backdrop-blur",
            selected ? "border-primary text-primary" : "text-muted-foreground hover:border-primary",
          )}
          title="Select for linking"
        >
          <input
            type="checkbox"
            className="peer sr-only"
            checked={!!selected}
            onChange={onToggleSelect}
          />
          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
        </label>
      )}

      {canEdit && (
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", image.id);
            e.dataTransfer.setData("application/x-slider-image", image.id);
            onDragStart();
          }}
          title={isGrouped ? "Drag to move linked group" : "Drag to reorder"}
          className="absolute right-8 top-1.5 z-10 grid h-5 w-5 cursor-grab place-items-center rounded border border-border bg-background/80 text-muted-foreground backdrop-blur active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3" />
        </div>
      )}

      {canEdit && isGrouped && onUnlink && (
        <button
          type="button"
          onClick={onUnlink}
          title="Remove from group"
          className="absolute right-14 top-1.5 z-10 grid h-5 w-5 place-items-center rounded border border-border bg-background/80 text-muted-foreground backdrop-blur hover:text-primary"
        >
          <Unlink className="h-3 w-3" />
        </button>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={onDelete}
          title="Remove placeholder"
          className="absolute right-1.5 top-1.5 z-10 grid h-5 w-5 place-items-center rounded border border-border bg-background/80 text-muted-foreground backdrop-blur hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}

      <div className="grid min-h-[220px] w-full flex-1 place-items-center px-3 py-8 text-center text-white">
        <div className="flex flex-col items-center justify-center gap-2">
          {Icon && <Icon className="h-9 w-9 shrink-0" strokeWidth={1.5} />}
          <p className="font-display text-[11px] font-black uppercase leading-tight tracking-wide">
            {label}
          </p>
          <PlaceholderSubtitle
            imageId={image.id}
            isProductVideo={isProductVideo}
            videoName={videoName}
            canEdit={canEdit}
            onChanged={onChanged}
          />
        </div>
      </div>
    </div>
  );
}

function PlaceholderSubtitle({
  imageId,
  isProductVideo,
  videoName,
  canEdit,
  onChanged,
}: {
  imageId: string;
  isProductVideo: boolean;
  videoName: string;
  canEdit: boolean;
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(videoName);

  useEffect(() => {
    if (!editing) setDraft(videoName);
  }, [videoName, editing]);

  if (!isProductVideo) {
    return <p className="text-[10px] text-white/75">Visual slot only</p>;
  }

  async function save(next: string) {
    const trimmed = next.trim();
    const value = trimmed || null;
    if (value === (videoName || null)) {
      setEditing(false);
      return;
    }
    const { error } = await supabase.from("slider_images").update({ title: value }).eq("id", imageId);
    if (error) {
      toast.error(`Could not save video name: ${error.message}`);
      setDraft(videoName);
      return;
    }
    setEditing(false);
    onChanged?.();
  }

  if (editing && canEdit) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => save(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save(draft);
          }
          if (e.key === "Escape") {
            setDraft(videoName);
            setEditing(false);
          }
        }}
        placeholder="Add video name…"
        className="w-full max-w-[150px] rounded border border-white/30 bg-black/20 px-1.5 py-0.5 text-center text-[10px] text-white placeholder:text-white/50 focus:border-white/60 focus:outline-none"
      />
    );
  }

  if (videoName) {
    return canEdit ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Edit video name"
        className="max-w-[150px] truncate text-[10px] text-white/90 hover:text-white hover:underline"
      >
        {videoName}
      </button>
    ) : (
      <p className="max-w-[150px] truncate text-[10px] text-white/75">{videoName}</p>
    );
  }

  return canEdit ? (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-[10px] italic text-white/60 hover:text-white/90"
    >
      Add video name…
    </button>
  ) : (
    <p className="text-[10px] text-white/75">Visual slot only</p>
  );
}
