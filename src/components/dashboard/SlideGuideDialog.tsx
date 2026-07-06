import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  GUIDE_CATEGORIES,
  MUST_HAVE_SLIDES,
  guideCategorySuggestions,
  type GuideCategory,
  type SectionKind,
} from "@/lib/sliderGuide";
import { cn } from "@/lib/utils";

const TOTAL_SLIDES = Math.max(...GUIDE_CATEGORIES.map((c) => c.slides.length));

export function SlideGuideDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, only this guide row is shown; otherwise the full table. */
  category?: GuideCategory | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "bg-surface-2",
          category ? "max-h-[85vh] overflow-y-auto sm:max-w-lg" : "max-w-[min(96vw,1800px)]",
        )}
      >
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-wide">
            {category ? category.title : "Slider content guide"}
          </DialogTitle>
          <DialogDescription>
            Slides 1–{MUST_HAVE_SLIDES} are must-have, slides {MUST_HAVE_SLIDES + 1}+ are nice-to-have
            {category ? "." : " — per PLP/PDP category."}
          </DialogDescription>
        </DialogHeader>
        {category ? <SingleCategoryView category={category} /> : <FullGuideTable />}
      </DialogContent>
    </Dialog>
  );
}

function SingleCategoryView({ category }: { category: GuideCategory }) {
  const mustHave = category.slides.slice(0, MUST_HAVE_SLIDES);
  const niceToHave = category.slides.slice(MUST_HAVE_SLIDES);
  return (
    <div className="space-y-2">
      <h3 className="rounded bg-destructive px-2 py-1 text-center text-[10px] font-black uppercase tracking-widest text-destructive-foreground">
        Must have
      </h3>
      {mustHave.map((content, idx) => (
        <SlideRow key={idx} index={idx} content={content} />
      ))}
      {mustHave.length < MUST_HAVE_SLIDES && (
        <p className="px-1 text-xs text-muted-foreground">
          No must-have content defined for slides {mustHave.length + 1}–{MUST_HAVE_SLIDES}.
        </p>
      )}
      {niceToHave.length > 0 && (
        <>
          <h3 className="rounded bg-primary/20 px-2 py-1 text-center text-[10px] font-black uppercase tracking-widest text-primary">
            Nice to have
          </h3>
          {niceToHave.map((content, idx) => (
            <SlideRow key={idx} index={MUST_HAVE_SLIDES + idx} content={content} />
          ))}
        </>
      )}
      {category.note && (
        <p className="px-1 text-xs text-muted-foreground">{category.note}</p>
      )}
    </div>
  );
}

function SlideRow({ index, content }: { index: number; content: string }) {
  return (
    <div className="flex items-start gap-3 rounded border border-border bg-background/50 p-3">
      <span className="w-16 shrink-0 rounded bg-primary px-2 py-0.5 text-center text-[10px] font-black uppercase tracking-widest text-primary-foreground">
        Slide {index + 1}
      </span>
      <span className="text-sm text-foreground">{content}</span>
    </div>
  );
}

function FullGuideTable() {
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full min-w-[2200px] border-collapse text-left">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border border-border bg-surface-2 p-2" />
            <th
              colSpan={MUST_HAVE_SLIDES}
              className="border border-border bg-destructive p-1.5 text-center text-[11px] font-black uppercase tracking-widest text-destructive-foreground"
            >
              Must have
            </th>
            <th
              colSpan={TOTAL_SLIDES - MUST_HAVE_SLIDES}
              className="border border-border bg-primary/25 p-1.5 text-center text-[11px] font-black uppercase tracking-widest text-primary"
            >
              Nice to have
            </th>
          </tr>
          <tr>
            <th className="sticky left-0 z-10 border border-border bg-surface-2 p-2" />
            {Array.from({ length: TOTAL_SLIDES }, (_, i) => (
              <th
                key={i}
                className={cn(
                  "border border-border p-1.5 text-center text-[11px] font-black uppercase tracking-widest",
                  i < MUST_HAVE_SLIDES
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/60 text-primary-foreground/90",
                )}
              >
                Slide {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GUIDE_CATEGORIES.map((c) => (
            <tr key={c.label}>
              <th className="sticky left-0 z-10 w-28 min-w-28 border border-border bg-primary p-2 text-center align-middle text-[11px] font-black uppercase leading-tight tracking-wider text-primary-foreground">
                <div>{c.kind.toUpperCase()}</div>
                <div className="mt-0.5 font-bold normal-case tracking-normal">{c.label}</div>
              </th>
              {Array.from({ length: TOTAL_SLIDES }, (_, i) => (
                <td
                  key={i}
                  className={cn(
                    "min-w-28 border border-border p-2 text-center align-middle text-[11px] leading-snug text-foreground/90",
                    i < MUST_HAVE_SLIDES ? "bg-background/40" : "bg-background/20",
                  )}
                  title={c.slides[i] && i >= MUST_HAVE_SLIDES ? "Nice to have" : undefined}
                >
                  {c.slides[i] ?? <span className="text-muted-foreground/50">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        PDP VIP: Attribut 2–10 follow the same pattern — 6 USP slides each (supplier or generic;
        view, food, lounge, atmosphere, etc.).
      </p>
    </div>
  );
}

/**
 * Combobox for the section name: fixed guide-category suggestions per kind,
 * free text allowed (like the image type combobox). The full list opens
 * immediately; filtering only kicks in while typing.
 */
export function SectionNameCombobox({
  value,
  onChange,
  onCommit,
  onCancel,
  kind,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  onCancel: () => void;
  kind: SectionKind;
  className?: string;
}) {
  const suggestions = guideCategorySuggestions(kind);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommit = useRef(false);
  // Show the full list until the user actually types; only then filter.
  const [touched, setTouched] = useState(false);
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

  // Open the list right away (autoFocus alone doesn't reliably fire onFocus).
  useEffect(() => {
    updateRect();
  }, []);

  const query = value.trim().toLowerCase();
  const current = value.trim();
  const filtered = touched
    ? suggestions.filter((s) => s.toLowerCase().includes(query) && s.toLowerCase() !== query)
    : suggestions;

  return (
    <div className="w-44 min-w-0">
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={value}
        onChange={(e) => {
          setTouched(true);
          onChange(e.target.value);
        }}
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
            skipBlurCommit.current = true;
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Section name…"
        className={cn(
          "w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none",
          className,
        )}
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
                className={cn(
                  "block w-full px-2 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground",
                  s.toLowerCase() === current.toLowerCase()
                    ? "font-bold text-primary"
                    : "text-foreground",
                )}
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
