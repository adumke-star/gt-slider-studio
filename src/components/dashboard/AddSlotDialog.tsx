import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
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

const MAX_COUNT = 12;

export function AddSlotDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (count: number) => void;
}) {
  const [count, setCount] = useState(1);

  useEffect(() => {
    if (open) setCount(1);
  }, [open]);

  function submit() {
    const n = Math.min(MAX_COUNT, Math.max(1, count));
    onConfirm(n);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-2 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Add image slots</DialogTitle>
          <DialogDescription>
            Empty slots for uploads and exports. Adding more than one links them so you can drag the
            group together.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="slot-count" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Count
            </Label>
            <input
              id="slot-count"
              type="number"
              min={1}
              max={MAX_COUNT}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <p className="text-[11px] text-muted-foreground">1–{MAX_COUNT} slots in a row</p>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-border bg-surface-2 px-3 py-3">
            <ImageIcon className="h-8 w-8 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <div>
              <p className="font-display text-xs font-black uppercase tracking-wide text-foreground">
                Image slot{count > 1 ? "s" : ""}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {count > 1 ? `${count} linked slots` : "Single slot"}
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Add {count > 1 ? `${count} slots` : "slot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
