import type { LucideIcon } from "lucide-react";
import { BadgeAlert, Clapperboard, Crown, Tent } from "lucide-react";

export type PlaceholderSlotType = {
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the placeholder card accent. */
  accent: string;
};

export const PLACEHOLDER_SLOT_TYPES: PlaceholderSlotType[] = [
  {
    label: "Product Video",
    icon: Clapperboard,
    accent: "border-violet-400/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  {
    label: "Mavericks-Club",
    icon: Crown,
    accent: "border-amber-400/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  },
  {
    label: "Glamping/Camping",
    icon: Tent,
    accent: "border-emerald-400/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  },
  {
    label: "VIP Incomplete",
    icon: BadgeAlert,
    accent: "border-rose-400/40 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  },
];

const byLabel = new Map(PLACEHOLDER_SLOT_TYPES.map((t) => [t.label.toLowerCase(), t]));

export function findPlaceholderType(label: string | null | undefined): PlaceholderSlotType | null {
  if (!label) return null;
  return byLabel.get(label.trim().toLowerCase()) ?? null;
}

export function isRealImageSlot(img: { is_placeholder?: boolean | null }): boolean {
  return !img.is_placeholder;
}
