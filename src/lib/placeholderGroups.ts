import type { SliderImage } from "@/components/dashboard/ImageCell";

/** Count placeholders per group id within a section list. */
export function placeholderGroupSizes(images: SliderImage[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const img of images) {
    if (!img.placeholder_group_id) continue;
    const id = img.placeholder_group_id;
    sizes.set(id, (sizes.get(id) ?? 0) + 1);
  }
  return sizes;
}

/**
 * When dragging a grouped placeholder, move every adjacent slot that shares
 * the same placeholder_group_id (inserted or linked as one block).
 */
export function getPlaceholderDragBlock(list: SliderImage[], draggedId: string): SliderImage[] {
  const idx = list.findIndex((i) => i.id === draggedId);
  if (idx === -1) return [];
  const item = list[idx];
  const groupId = item.placeholder_group_id;
  if (!groupId) return [item];

  let start = idx;
  let end = idx;
  while (start > 0 && list[start - 1].placeholder_group_id === groupId) start--;
  while (end < list.length - 1 && list[end + 1].placeholder_group_id === groupId) end++;
  return list.slice(start, end + 1);
}

/** After unlinking one member, clear group id when only one slot remains. */
export function remainingGroupMemberIds(
  images: SliderImage[],
  groupId: string,
  excludeId: string,
): string[] {
  return images
    .filter((i) => i.placeholder_group_id === groupId && i.id !== excludeId)
    .map((i) => i.id);
}
