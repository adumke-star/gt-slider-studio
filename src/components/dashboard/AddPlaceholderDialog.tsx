import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLACEHOLDER_SLOT_TYPES, isProductVideoPlaceholder } from "@/lib/placeholderSlots";

const MAX_COUNT = 12;

export function AddPlaceholderDialog({
  open,
  onOpenChange,
  initialLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLabel?: string;
  onConfirm: (label: string, count: number, note?: string) => void;
}) {
  const defaultLabel = initialLabel ?? PLACEHOLDER_SLOT_TYPES[0]?.label ?? "Product Video";
  const [label, setLabel] = useState(defaultLabel);
  const [count, setCount] = useState(1);
  const [videoName, setVideoName] = useState("");

  useEffect(() => {
    if (open) {
      setLabel(initialLabel ?? PLACEHOLDER_SLOT_TYPES[0]?.label ?? "Product Video");
      setCount(1);
      setVideoName("");
    }
  }, [open, initialLabel]);

  const selectedType = PLACEHOLDER_SLOT_TYPES.find((t) => t.label === label);
  const Icon = selectedType?.icon;

  function submit() {
    const n = Math.min(MAX_COUNT, Math.max(1, Number(count) || 1));
    const note = isProductVideoPlaceholder(label) ? videoName.trim() : undefined;
    onConfirm(label, n, note || undefined);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-2 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Add placeholder slots</DialogTitle>
          <DialogDescription>
            Visual slots only — not exported. Adding more than one links them so you can drag the
            group together.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Type
            </Label>
            <Select value={label} onValueChange={setLabel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLACEHOLDER_SLOT_TYPES.map((t) => {
                  const TypeIcon = t.icon;
                  return (
                    <SelectItem key={t.label} value={t.label}>
                      <span className="inline-flex items-center gap-2">
                        <TypeIcon className="h-3.5 w-3.5 opacity-70" />
                        {t.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="placeholder-count" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Count
            </Label>
            <input
              id="placeholder-count"
              type="number"
              min={1}
              max={MAX_COUNT}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <p className="text-[11px] text-muted-foreground">1–{MAX_COUNT} slots in a row</p>
          </div>
          {isProductVideoPlaceholder(label) && (
            <div className="space-y-2">
              <Label htmlFor="placeholder-video-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Video name
              </Label>
              <input
                id="placeholder-video-name"
                type="text"
                value={videoName}
                onChange={(e) => setVideoName(e.target.value)}
                placeholder="e.g. Mavericks F1 / GP"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <p className="text-[11px] text-muted-foreground">Optional — shown on the placeholder slot</p>
            </div>
          )}
          {Icon && (
            <div
              className={`flex items-center gap-3 rounded-md border-2 border-dashed px-3 py-3 text-white ${selectedType?.accent ?? ""}`}
            >
              <Icon className="h-8 w-8 shrink-0" strokeWidth={1.5} />
              <div>
                <p className="font-display text-xs font-black uppercase tracking-wide">{label}</p>
                <p className="text-[10px] text-white/75">
                  {isProductVideoPlaceholder(label) && videoName.trim()
                    ? videoName.trim()
                    : count > 1
                      ? `${count} linked placeholders`
                      : "Single placeholder"}
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="px-0 pb-0 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
              Add {count > 1 ? `${count} placeholders` : "placeholder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
