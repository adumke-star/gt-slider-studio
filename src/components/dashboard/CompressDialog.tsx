import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { transformImage, extForFormat, type ExportFormat } from "@/lib/imageProcess";
import { resolveFocal } from "@/lib/cropUtils";
import { signedUrl, uploadFile, removeFile } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import type { SliderImage } from "./ImageCell";

export function CompressDialog({
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
    const ext = extForFormat(format);
    let done = 0;
    let ok = 0;
    let skipped = 0;

    for (const img of eligible) {
      const label = img.title?.trim() || `Bild ${img.id.slice(0, 6)}`;
      try {
        const origUrl = await signedUrl("originals", img.original_path!);
        if (!origUrl) continue;
        const blob = await (await fetch(origUrl)).blob();
        const result = await transformImage(blob, {
          format,
          targetKB,
          width: 633,
          height: 382,
          focalPoint: resolveFocal(img.crop_x, img.crop_y),
        });
        const { blob: out, mime, sizeKB, overTarget, downscaled } = result;

        // Harte Grenze: über dem Limit wird NICHT gespeichert, Original bleibt erhalten.
        if (overTarget) {
          toast.error(
            `${label} konnte ${targetKB} KB nicht erreichen (${sizeKB} KB) – nicht gespeichert. Original bleibt erhalten.`,
            { duration: 7000 },
          );
          skipped++;
          continue;
        }

        if (downscaled) toast.info(`${label}: Auflösung reduziert, um ${targetKB} KB zu erreichen.`);
        const folder = img.section_id ?? img.area;
        const outPath = `${img.race_id}/${folder}/${img.id}.${ext}`;
        await uploadFile("compressed", outPath, out, mime);
        // Delete the original — only the compressed version is kept to save storage
        const origPath = img.original_path!;
        try {
          await removeFile("originals", origPath);
        } catch (e) {
          console.warn("failed to delete original after compression", origPath, e);
        }
        await supabase.from("slider_images").update({
          compressed_path: outPath,
          compressed_size_kb: sizeKB,
          format,
          original_path: null,
          original_size_kb: null,
          status: img.status === "live" ? "live" : "image_done",
        }).eq("id", img.id);
        ok++;
      } catch (e) {
        console.error("compress failed for", img.id, e);
        toast.error(`Komprimierung fehlgeschlagen für ${label}`);
      } finally {
        done++;
        setProgress(done);
      }
    }

    if (ok > 0) toast.success(`${ok} Bild${ok === 1 ? "" : "er"} komprimiert`);
    if (skipped > 0) {
      toast.warning(
        `${skipped} Bild${skipped === 1 ? "" : "er"} über ${targetKB} KB – nicht gespeichert. Versuche ein höheres Limit oder WebP.`,
        { duration: 7000 },
      );
    }

    setRunning(false);
    onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-2 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Compress {eligible.length} Bild{eligible.length === 1 ? "" : "er"}
          </DialogTitle>
          <DialogDescription>
            Auf 633×382 zuschneiden und komprimieren. Die komprimierte Version wird in Supabase gespeichert, das Original wird gelöscht.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold uppercase tracking-wider text-muted-foreground">Zielgröße</span>
              <span className="font-display text-lg text-primary">{targetKB} KB</span>
            </div>
            <Slider value={[targetKB]} min={10} max={500} step={1}
              onValueChange={([v]) => setTargetKB(v)} disabled={running} />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>10 KB</span><span>500 KB</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Format</div>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)} disabled={running}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="webp">WebP (empfohlen)</SelectItem>
                <SelectItem value="avif">AVIF</SelectItem>
                <SelectItem value="jpeg">JPG</SelectItem>
                <SelectItem value="png">PNG (verlustfrei)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
            Ausgabe: <span className="text-foreground">633 × 382 px</span> · Cover-Fill, zentriert zugeschnitten.
            Geeignet: <span className="text-foreground">{eligible.length}</span> von {images.length} ausgewählt.
          </div>
          {running && (
            <div className="text-sm text-primary">
              Verarbeite {progress} / {eligible.length}…
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>Abbrechen</Button>
          <Button onClick={run} disabled={running || eligible.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            {running
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Komprimiere</>
              : "Jetzt komprimieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
