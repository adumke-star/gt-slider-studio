import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  GUIDE_CATEGORIES,
  findGuideCategory,
  guideCategorySuggestions,
  type GuideCategory,
  type SectionKind,
} from "@/lib/sliderGuide";
import { cn } from "@/lib/utils";

const MAX_SLIDES = 6;

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
      <DialogContent className={cn("bg-surface-2", category ? "sm:max-w-lg" : "max-w-[min(96vw,1100px)]")}>
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-wide">
            {category ? category.title : "Slider content guide"}
          </DialogTitle>
          <DialogDescription>
            Must-have content per slide{category ? " for this section" : " — per PLP/PDP category"}.
          </DialogDescription>
        </DialogHeader>
        {category ? <SingleCategoryView category={category} /> : <FullGuideTable />}
      </DialogContent>
    </Dialog>
  );
}

function SingleCategoryView({ category }: { category: GuideCategory }) {
  return (
    <div className="space-y-2">
      {category.slides.map((content, idx) => (
        <div key={idx} className="flex items-start gap-3 rounded border border-border bg-background/50 p-3">
          <span className="shrink-0 rounded bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary-foreground">
            Slide {idx + 1}
          </span>
          <span className="text-sm text-foreground">{content}</span>
        </div>
      ))}
      {category.slides.length < MAX_SLIDES && (
        <p className="px-1 text-xs text-muted-foreground">
          No must-have content defined for slides {category.slides.length + 1}–{MAX_SLIDES}.
        </p>
      )}
    </div>
  );
}

function FullGuideTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          <tr>
            <th className="border border-border bg-background/60 p-2" />
            <th
              colSpan={MAX_SLIDES}
              className="border border-border bg-destructive p-1.5 text-center text-[11px] font-black uppercase tracking-widest text-destructive-foreground"
            >
              Must have
            </th>
          </tr>
          <tr>
            <th className="border border-border bg-background/60 p-2" />
            {Array.from({ length: MAX_SLIDES }, (_, i) => (
              <th
                key={i}
                className="border border-border bg-primary p-1.5 text-center text-[11px] font-black uppercase tracking-widest text-primary-foreground"
              >
                Slide {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GUIDE_CATEGORIES.map((c) => (
            <tr key={c.label}>
              <th className="w-28 border border-border bg-primary p-2 text-center align-middle text-[11px] font-black uppercase leading-tight tracking-wider text-primary-foreground">
                <div>{c.kind.toUpperCase()}</div>
                <div className="mt-0.5 font-bold normal-case tracking-normal">{c.label}</div>
              </th>
              {Array.from({ length: MAX_SLIDES }, (_, i) => (
                <td
                  key={i}
                  className="border border-border bg-background/40 p-2 text-center align-middle text-[11px] leading-snug text-foreground/90"
                >
                  {c.slides[i] ?? <span className="text-muted-foreground/50">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Click-to-edit guide category for a section header: shows the current
 * category as a small chip; editors can pick from fixed suggestions or type
 * anything (like the image type combobox).
 */
export function GuideCategoryPicker({
  value,
  kind,
  canEdit,
  onSave,
}: {
  value: string | null;
  kind: SectionKind;
  canEdit: boolean;
  onSave: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const matched = findGuideCategory(value);

  function commit(v: string) {
    setEditing(false);
    const trimmed = v.trim();
    if ((trimmed || null) === (value ?? null)) return;
    onSave(trimmed || null);
  }

  if (editing && canEdit) {
    return (
      <CategoryCombobox
        value={draft}
        onChange={setDraft}
        onCommit={commit}
        onCancel={() => setEditing(false)}
        suggestions={guideCategorySuggestions(kind)}
      />
    );
  }

  const label = value ? value : "Category?";
  const chip = (
    <span
      className={cn(
        "shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
        matched
          ? "border-border bg-background/60 text-muted-foreground"
          : value
            ? "border-border bg-background/60 text-muted-foreground/70"
            : "border-dashed border-border text-muted-foreground/60",
      )}
    >
      {label}
    </span>
  );

  if (!canEdit) return value ? chip : null;

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
      title="Guide category — links this section to a row of the slider content guide"
      className="hover:opacity-80"
    >
      {chip}
    </button>
  );
}

function CategoryCombobox({
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
    <div className="w-40">
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
        placeholder="Category…"
        className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
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
                  "block w-full px-2 py-1 text-left text-[10px] hover:bg-accent hover:text-accent-foreground",
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
