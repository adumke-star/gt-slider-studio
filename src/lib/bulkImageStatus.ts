import { supabase } from "@/integrations/supabase/client";
import type { SliderImage } from "@/components/dashboard/ImageCell";

export type ImageStatus = SliderImage["status"];

/** Status values available for bulk updates (comment-driven statuses excluded). */
export type BulkStatus = "live" | "image_done" | "exported" | "todo";

export const BULK_STATUS_OPTIONS: { value: BulkStatus; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "exported", label: "Exported" },
  { value: "image_done", label: "Compressed" },
  { value: "todo", label: "To do" },
];

export const STATUS_META: Record<ImageStatus, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-[var(--status-live)]/15 text-[var(--status-live)] border-[var(--status-live)]/40" },
  image_done: { label: "Compressed", cls: "bg-primary/15 text-primary border-primary/40" },
  changes: { label: "Changes", cls: "bg-[var(--status-changes)]/15 text-[var(--status-changes)] border-[var(--status-changes)]/40" },
  solved: { label: "Solved", cls: "bg-[var(--status-solved)]/15 text-[var(--status-solved)] border-[var(--status-solved)]/40" },
  exported: { label: "Exported", cls: "bg-[var(--status-exported)]/15 text-[var(--status-exported)] border-[var(--status-exported)]/40" },
  todo: { label: "To do", cls: "bg-[var(--status-todo)]/15 text-[var(--status-todo)] border-[var(--status-todo)]/40" },
  blank: { label: "To do", cls: "bg-[var(--status-todo)]/15 text-[var(--status-todo)] border-[var(--status-todo)]/40" },
};

const BATCH_SIZE = 100;

/** Slots with an uploaded file — empty placeholders are skipped. */
export function imagesEligibleForBulkStatus(images: SliderImage[]): SliderImage[] {
  return images.filter((img) => img.original_path || img.compressed_path);
}

export async function bulkSetImageStatus(imageIds: string[], status: BulkStatus): Promise<void> {
  if (imageIds.length === 0) return;
  for (let i = 0; i < imageIds.length; i += BATCH_SIZE) {
    const batch = imageIds.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("slider_images").update({ status }).in("id", batch);
    if (error) throw error;
  }
}

/** Distinct images (from the given ids) that have at least one open comment. */
export async function countImagesWithOpenComments(imageIds: string[]): Promise<number> {
  if (imageIds.length === 0) return 0;
  const { data, error } = await supabase
    .from("comments")
    .select("image_id")
    .in("image_id", imageIds)
    .is("resolved_at", null);
  if (error) throw error;
  return new Set((data ?? []).map((c) => c.image_id)).size;
}
