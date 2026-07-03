// Rule engine for the slider "Rule Setup".
// Pure functions: given a race's sections + images, return violations.
// Rule numbers refer to the team's Rule Setup sheet.

export type ImageType = "compositing" | "race_action" | "fan_atmosphere";

export const IMAGE_TYPES: ImageType[] = ["compositing", "race_action", "fan_atmosphere"];

export const IMAGE_TYPE_LABELS: Record<ImageType, string> = {
  compositing: "Compositing",
  race_action: "Race action",
  fan_atmosphere: "Fan atmosphere",
};

/**
 * Fixed suggestion list for the free-text type field. Deliberately not fed
 * from existing data so it stays short; anything else has to be typed out.
 */
export const IMAGE_TYPE_SUGGESTIONS: string[] = [
  "Compositing",
  "Race action",
  "Fan atmosphere",
  "Glamping/Camping",
  "VIP",
  "VIP Generic",
];

/**
 * The type field is free text; only these three types drive automatic rules.
 * Matches keys ("race_action") and labels ("Race action") case-insensitively,
 * ignoring spaces/underscores/hyphens.
 */
export function normalizeImageType(text: string | null | undefined): ImageType | null {
  if (!text) return null;
  const compact = text.trim().toLowerCase().replace(/[\s_-]+/g, "");
  for (const key of IMAGE_TYPES) {
    if (compact === key.replace(/_/g, "")) return key;
    if (compact === IMAGE_TYPE_LABELS[key].toLowerCase().replace(/[\s_-]+/g, "")) return key;
  }
  return null;
}

/** Display text for a stored type value: known keys get their label, free text stays as-is. */
export function imageTypeLabel(text: string | null | undefined): string {
  if (!text) return "";
  const known = normalizeImageType(text);
  return known ? IMAGE_TYPE_LABELS[known] : text;
}

export type RuleSeverity = "error" | "warning" | "info";

export type RuleViolation = {
  rule: number;
  key: string;
  severity: RuleSeverity;
  sectionId?: string;
  message: string;
};

/** Rules that need human judgment — shown as a manual checklist per race. */
export const MANUAL_RULES: { key: string; rule: number; label: string }[] = [
  { key: "mood_location", rule: 8, label: "Images reflect the feeling and mood of the event location" },
  { key: "teams_fans", rule: 9, label: "Popular motorsport teams and fan friendship are represented" },
];

export const MIN_SLIDES = 6;
const FAN_ATMOSPHERE_MAX_AGE_YEARS = 2;
const SEASON_GRACE_DAYS = 28; // "4 weeks after the first race"

type RuleSection = {
  id: string;
  kind: "plp" | "pdp";
  name: string;
  max_slides?: number | null;
};

type RuleImage = {
  id: string;
  section_id: string | null;
  image_type?: string | null;
  season?: number | null;
  created_at?: string | null;
};

type RaceLike = {
  id: string;
  series: string;
  race_date: string | null;
};

export type SeriesSeasonInfo = {
  season: number;
  /** After this date, compositing/race action images must show the current season (rules 3/4). */
  deadline: Date | null;
};

/**
 * Current season = calendar year. Deadline = earliest race date of the series
 * in the current year + 4 weeks. Null when the series has no dated races this year.
 */
export function computeSeriesSeasonInfo(races: RaceLike[], now = new Date()): Map<string, SeriesSeasonInfo> {
  const season = now.getFullYear();
  const result = new Map<string, SeriesSeasonInfo>();
  for (const race of races) {
    if (!result.has(race.series)) result.set(race.series, { season, deadline: null });
    if (!race.race_date) continue;
    const date = new Date(race.race_date);
    if (date.getFullYear() !== season) continue;
    const entry = result.get(race.series)!;
    const candidate = new Date(date.getTime() + SEASON_GRACE_DAYS * 24 * 60 * 60 * 1000);
    if (!entry.deadline || candidate < entry.deadline) entry.deadline = candidate;
  }
  return result;
}

export function evaluateRaceRules({
  sections,
  images,
  seasonInfo,
  now = new Date(),
}: {
  sections: RuleSection[];
  images: RuleImage[];
  seasonInfo?: SeriesSeasonInfo;
  now?: Date;
}): RuleViolation[] {
  const violations: RuleViolation[] = [];

  const bySection = new Map<string, RuleImage[]>();
  for (const img of images) {
    if (!img.section_id) continue;
    if (!bySection.has(img.section_id)) bySection.set(img.section_id, []);
    bySection.get(img.section_id)!.push(img);
  }

  for (const section of sections) {
    const imgs = bySection.get(section.id) ?? [];
    const label = `${section.kind.toUpperCase()} „${section.name}“`;

    // Rule 1 + 5: at least 6 images per slider.
    if (imgs.length < MIN_SLIDES) {
      violations.push({
        rule: 1,
        key: `min-slides-${section.id}`,
        severity: "error",
        sectionId: section.id,
        message: `${label}: only ${imgs.length}/${MIN_SLIDES} images — fill remaining slides (rule 1/5).`,
      });
    }

    // Rule 2: only enforced when a maximum was explicitly set for the section.
    if (section.max_slides != null && imgs.length > section.max_slides) {
      violations.push({
        rule: 2,
        key: `max-slides-${section.id}`,
        severity: "warning",
        sectionId: section.id,
        message: `${label}: ${imgs.length} images exceed the configured maximum of ${section.max_slides} (rule 2).`,
      });
    }

    // Rule 6: fan atmosphere images must be refreshed every 2 years.
    const staleCutoff = new Date(now);
    staleCutoff.setFullYear(staleCutoff.getFullYear() - FAN_ATMOSPHERE_MAX_AGE_YEARS);
    const staleFan = imgs.filter(
      (img) =>
        normalizeImageType(img.image_type) === "fan_atmosphere" &&
        img.created_at &&
        new Date(img.created_at) < staleCutoff,
    );
    if (staleFan.length > 0) {
      violations.push({
        rule: 6,
        key: `fan-age-${section.id}`,
        severity: "warning",
        sectionId: section.id,
        message: `${label}: ${staleFan.length} fan atmosphere image${staleFan.length === 1 ? "" : "s"} older than ${FAN_ATMOSPHERE_MAX_AGE_YEARS} years (rule 6).`,
      });
    }

    // Rules 3 + 4: compositing / race action must show the current season
    // once the grace period (first race + 4 weeks) is over.
    if (seasonInfo?.deadline && now > seasonInfo.deadline) {
      const outdated = imgs.filter((img) => {
        const type = normalizeImageType(img.image_type);
        return (
          (type === "compositing" || type === "race_action") &&
          img.season != null &&
          img.season < seasonInfo.season
        );
      });
      if (outdated.length > 0) {
        violations.push({
          rule: 3,
          key: `season-${section.id}`,
          severity: "warning",
          sectionId: section.id,
          message: `${label}: ${outdated.length} compositing/race action image${outdated.length === 1 ? "" : "s"} still show season ${Math.max(...outdated.map((i) => i.season!))} instead of ${seasonInfo.season} (rules 3/4).`,
        });
      }
    }
  }

  // Coverage hint: untyped images cannot be checked against rules 3/4/6.
  const untyped = images.filter((img) => img.section_id && !img.image_type?.trim());
  if (untyped.length > 0) {
    violations.push({
      rule: 0,
      key: "untyped",
      severity: "info",
      message: `${untyped.length} image${untyped.length === 1 ? "" : "s"} without a type — use Compositing / Race action / Fan atmosphere so rules 3, 4 and 6 can be checked (any other text is fine too).`,
    });
  }

  return violations;
}

/** True when the race should get a "rule violation" flag (info hints do not count). */
export function hasRuleViolations(violations: RuleViolation[]): boolean {
  return violations.some((v) => v.severity !== "info");
}
