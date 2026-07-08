import type { LucideIcon } from "lucide-react";
import { BadgeAlert, Bike, Clapperboard, Crown, Tent } from "lucide-react";

export type PlaceholderSlotType = {
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the placeholder card accent. */
  accent: string;
};

/** Placeholder that occupies a slider slot (video) — lowers the real-image minimum by one. */
export const PRODUCT_VIDEO_PLACEHOLDER_LABEL = "Product Video";

export const PLACEHOLDER_SLOT_TYPES: PlaceholderSlotType[] = [
  {
    label: PRODUCT_VIDEO_PLACEHOLDER_LABEL,
    icon: Clapperboard,
    accent: "border-violet-400/50 bg-violet-600/85",
  },
  {
    label: "Mavericks-Club",
    icon: Crown,
    accent: "border-amber-400/50 bg-amber-600/85",
  },
  {
    label: "Glamping/Camping",
    icon: Tent,
    accent: "border-emerald-400/50 bg-emerald-600/85",
  },
  {
    label: "VIP Incomplete",
    icon: BadgeAlert,
    accent: "border-rose-400/50 bg-rose-600/85",
  },
  {
    label: "Snipers",
    icon: Bike,
    accent: "border-orange-400/50 bg-orange-700/85",
  },
];

const byLabel = new Map(PLACEHOLDER_SLOT_TYPES.map((t) => [t.label.toLowerCase(), t]));

export function findPlaceholderType(label: string | null | undefined): PlaceholderSlotType | null {
  if (!label) return null;
  return byLabel.get(label.trim().toLowerCase()) ?? null;
}

export function isProductVideoPlaceholder(label: string | null | undefined): boolean {
  return label?.trim().toLowerCase() === PRODUCT_VIDEO_PLACEHOLDER_LABEL.toLowerCase();
}

export function isRealImageSlot(img: { is_placeholder?: boolean | null }): boolean {
  return !img.is_placeholder;
}
