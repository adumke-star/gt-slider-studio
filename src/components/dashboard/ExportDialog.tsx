import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { transformImage, extForFormat, type ExportFormat } from "@/lib/imageProcess";
import { signedUrl, uploadFile } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import type { SliderImage } from "./ImageCell";

export function ExportDialog({
  open,
  onOpenChange,
  images,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  images: SliderImage[];
  onDone: () => void;
}) {
  const [targetKB, setTargetKB] = useState(120);
  const [format, setFormat] = useState<ExportFormat>("webp");
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);

  const eligible = images.filter((i) => i.original_path);

  async function run() {
    setRunning(true);
    setProgress(0);
    let done = 0;
    for (const img of eligible) {
      try {
        const origUrl = await signedUrl("originals", img.original_path!);
        if (!origUrl) continue;
        const blob = await (await fetch(origUrl)).blob();
        const { blob: out, mime, sizeKB } = await transformImage(blob, {
          format, targetKB, width: 633, height: 382,
        });
        const ext = extForFormat(format);
        const outPath = `${img.race_id}/${img.area}/${img.id}.${ext}`;
        await uploadFile("compressed", outPath, out, mime);
        await supabase.from("slider_images").update({
          compressed_path: outPath,
          compressed_size_kb: sizeKB,
          format,
          status: img.status === "live" ? "live" : "image_done",
        }).eq("id", img.id);
      } catch (e) {
        console.error("export failed for", img.id, e);
      }
      done++;
      setProgress(done);
    }
    setRunning(false);
    onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-2 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Export {eligible.length} image{eligible.length === 1 ? "" : "s"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold uppercase tracking-wider text-muted-foreground">Target size</span>
              <span className="font-display text-lg text-primary">{targetKB} KB</span>
            </div>
            <Slider value={[targetKB]} min={20} max={500} step={10}
              onValueChange={([v]) => setTargetKB(v)} disabled={running} />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>20 KB</span><span>500 KB</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Format</div>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)} disabled={running}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="webp">WebP (recommended)</SelectItem>
                <SelectItem value="avif">AVIF</SelectItem>
                <SelectItem value="jpeg">JPG</SelectItem>
                <SelectItem value="png">PNG (lossless)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
            Output: <span className="text-foreground">633 × 382 px</span> · cover fill, center-cropped.
            Eligible: <span className="text-foreground">{eligible.length}</span> of {images.length} selected.
          </div>
          {running && (
            <div className="text-sm text-primary">
              Processing {progress} / {eligible.length}…
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>Cancel</Button>
          <Button onClick={run} disabled={running || eligible.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exporting</> : "Export now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
