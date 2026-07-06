// Content guide for PLP/PDP sliders ("MUST HAVE" per slide), maintained in code.
// Sections are matched to a guide row via their free-text guide category
// (see `slider_sections.guide_category`), not via the section name.

export type SectionKind = "plp" | "pdp";

export type GuideCategory = {
  /** Stored in slider_sections.guide_category and shown in the combobox. */
  label: string;
  kind: SectionKind;
  /** Heading shown in the guide dialog, e.g. "PLP — Main Page". */
  title: string;
  /** Content per slide, index 0 = Slide 1. Slides 1-6 are MUST HAVE, 7+ NICE TO HAVE. */
  slides: string[];
  /** Extra remark shown under the guide row. */
  note?: string;
};

/** Slides 1-6 are MUST HAVE; everything after is NICE TO HAVE. */
export const MUST_HAVE_SLIDES = 6;

const COMPOSITING_OR_ACTION =
  "Compositing (European F1 + GP) or Race action car/bike (other events)";

export const GUIDE_CATEGORIES: GuideCategory[] = [
  {
    label: "Main Page",
    kind: "plp",
    title: "PLP — Main Page",
    slides: [
      COMPOSITING_OR_ACTION,
      "Fan Atmosphere",
      "Race action Car / Bike",
      "Business Unit Travel: Hotel element",
      "Business Unit Travel: Transfer element",
      "Business Unit Travel: Travel guide element",
      "Business Unit VIP: VIP (mavericks-club if possible)",
      "Business Unit VIP: VIP (mavericks-club if possible)",
      "Business Unit VIP: VIP (mavericks-club if possible)",
      "Business Unit VIP: VIP atmosphere",
      "Business Unit VIP: VIP atmosphere",
      "Business Unit VIP: VIP atmosphere",
      "Business Unit Glamping & Camping: Fan atmosphere glamping ground",
      "Business Unit Glamping & Camping: Fan atmosphere glamping ground",
      "Business Unit Glamping & Camping: Fan atmosphere glamping ground",
      "Fan Atmosphere",
      "Fan Atmosphere",
      "Fan Atmosphere",
    ],
  },
  {
    label: "Tickets",
    kind: "pdp",
    title: "PDP — Tickets",
    slides: [
      COMPOSITING_OR_ACTION,
      "Fan Atmosphere",
      "Race action Car / Bike",
      ...Array(9).fill("Fan Atmosphere (Grandstand view, atmosphere)"),
    ],
  },
  {
    label: "VIP",
    kind: "pdp",
    title: "PDP — VIP",
    slides: [
      "Product Video Mavericks-Club F1 / GP (if applicable)",
      ...Array(5).fill("Mavericks-Club (if applicable)"),
      ...Array(6).fill("Snipers (if applicable)"),
      ...Array(6).fill("Attribut 1 USP (supplier or generic) — view, food, lounge, atmosphere, etc."),
    ],
    note: "Attribut 2–10 follow the same pattern: 6 USP slides each (supplier or generic — view, food, lounge, atmosphere, etc.).",
  },
  {
    label: "Travel",
    kind: "pdp",
    title: "PDP — Travel",
    slides: [
      "Product Video (F1 or GP)",
      COMPOSITING_OR_ACTION,
      "Hotel element",
      "Transfer element",
      "Travel Guide element",
      ...Array(7).fill("Fan Atmosphere"),
    ],
  },
  {
    label: "Glamping & Camping",
    kind: "pdp",
    title: "PDP — Glamping & Camping",
    slides: [
      "Product Video (F1 or GP)",
      COMPOSITING_OR_ACTION,
      "Glamping area atmosphere (aerial shot)",
      "Glamping Tent element",
      ...Array(5).fill("Glamping area atmosphere (facilities, bar, tent, etc)"),
      ...Array(3).fill("Fan Atmosphere"),
    ],
  },
  {
    label: "F1 Experiences",
    kind: "pdp",
    title: "PDP — F1® Experiences Experience Tickets",
    slides: [COMPOSITING_OR_ACTION, ...Array(11).fill("Product USP")],
  },
  {
    label: "MotoGP Premier",
    kind: "pdp",
    title: "PDP — MotoGP Premier Experience Tickets",
    slides: [COMPOSITING_OR_ACTION, ...Array(11).fill("Product USP")],
  },
  {
    label: "Camping Resell",
    kind: "pdp",
    title: "PDP — Camping Resell",
    slides: [
      COMPOSITING_OR_ACTION,
      ...Array(5).fill("Generic Camping atmosphere (supplier or generic)"),
    ],
  },
  {
    label: "Parking",
    kind: "pdp",
    title: "PDP — Parking",
    slides: [COMPOSITING_OR_ACTION],
  },
];

/** Combobox suggestions for a section of the given kind. */
export function guideCategorySuggestions(kind: SectionKind): string[] {
  return GUIDE_CATEGORIES.filter((c) => c.kind === kind).map((c) => c.label);
}

/** Find the guide row for a stored category value (case-insensitive). */
export function findGuideCategory(value: string | null | undefined): GuideCategory | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  return GUIDE_CATEGORIES.find((c) => c.label.toLowerCase() === v) ?? null;
}

/**
 * Best-effort keyword match for sections that don't have a category yet
 * (mirrors the SQL backfill in the guide_category migration).
 */
export function guessCategory(name: string, kind: SectionKind): string | null {
  if (kind === "plp") return "Main Page";
  const n = name.toLowerCase();
  if (n.includes("vip")) return "VIP";
  if (n.includes("travel")) return "Travel";
  if (n.includes("resell")) return "Camping Resell";
  if (n.includes("glamping") || n.includes("camping")) return "Glamping & Camping";
  if (n.includes("parking")) return "Parking";
  if (n.includes("premier") || (n.includes("motogp") && n.includes("experience"))) return "MotoGP Premier";
  if (n.includes("experience")) return "F1 Experiences";
  if (n.includes("ticket")) return "Tickets";
  return null;
}
