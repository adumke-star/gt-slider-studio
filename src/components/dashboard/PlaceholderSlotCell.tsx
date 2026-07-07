import { useRef, useState } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { findPlaceholderType } from "@/lib/placeholderSlots";
import type { SliderImage } from "./ImageCell";

export function PlaceholderSlotCell({
  image,
  canEdit,
  onDelete,
  onDragStart,
  onDropBefore,
  onDropAfter,
}: {
  image: SliderImage;
  canEdit: boolean;
  onDelete: () => void;
  onDragStart: () => void;
  onDropBefore: () => void;
  onDropAfter: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dropSide, setDropSide] = useState<"left" | "right" | null>(null);
  const type = findPlaceholderType(image.placeholder_label);
  const Icon = type?.icon;
  const label = image.placeholder_label ?? "Placeholder";

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
        type?.accent ?? "border-border bg-muted/30 text-muted-foreground",
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

      {canEdit && (
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", image.id);
            e.dataTransfer.setData("application/x-slider-image", image.id);
            onDragStart();
          }}
          title="Drag to reorder"
          className="absolute right-8 top-1.5 z-10 grid h-5 w-5 cursor-grab place-items-center rounded border border-border bg-background/80 text-muted-foreground backdrop-blur active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3" />
        </div>
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

      <div className="flex aspect-[633/382] w-full flex-col items-center justify-center gap-2 px-3 text-center">
        {Icon && <Icon className="h-8 w-8 opacity-80" strokeWidth={1.5} />}
        <p className="font-display text-[11px] font-black uppercase leading-tight tracking-wide">
          {label}
        </p>
        <p className="text-[10px] opacity-70">Visual slot only</p>
      </div>
    </div>
  );
}
