import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { transformImage, extForFormat, type ExportFormat } from "@/lib/imageProcess";
import { resolveFocal } from "@/lib/cropUtils";
import { uploadFile, removeFile } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { fetchCompressSource, isCompressEligible } from "@/lib/compressImage";
import type { SliderImage } from "./ImageCell";

function imageLabel(img: SliderImage): string {
  return img.title?.trim() || `Image ${img.id.slice(0, 6)}`;
}

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

  const eligible = images.filter(isCompressEligible);

  async function run() {
    setRunning(true);
    setProgress(0);
    const ext = extForFormat(format);
    let done = 0;
    let ok = 0;
    let skipped = 0;
    let failed = 0;

    for (const img of eligible) {
      const label = imageLabel(img);
      try {
        const source = await fetchCompressSource(img);
        if (!source) {
          toast.error(`${label}: image file not found in storage. Try re-uploading.`, { duration: 7000 });
          failed++;
          continue;
        }

        const result = await transformImage(source.blob, {
          format,
          targetKB,
          width: 633,
          height: 382,
          focalPoint: source.from === "originals" ? resolveFocal(img.crop_x, img.crop_y) : undefined,
        });
        const { blob: out, mime, sizeKB, overTarget, downscaled } = result;

        if (overTarget) {
          toast.error(
            `${label} could not reach ${targetKB} KB (${sizeKB} KB) — not saved.`,
            { duration: 7000 },
          );
          skipped++;
          continue;
        }

        if (downscaled) toast.info(`${label}: resolution reduced to reach ${targetKB} KB.`);

        const folder = img.section_id ?? img.area;
        const outPath = `${img.race_id}/${folder}/${img.id}.${ext}`;
        const prevOriginalPath = img.original_path;
        const prevCompressedPath = img.compressed_path;

        await uploadFile("compressed", outPath, out, mime);

        const { error: dbError } = await supabase.from("slider_images").update({
          compressed_path: outPath,
          compressed_size_kb: sizeKB,
          format,
          original_path: null,
          original_size_kb: null,
          status: img.status === "live" ? "live" : "image_done",
        }).eq("id", img.id);

        if (dbError) {
          console.error("compress DB update failed for", img.id, dbError);
          try {
            await removeFile("compressed", outPath);
          } catch (e) {
            console.warn("failed to roll back compressed upload", outPath, e);
          }
          toast.error(`${label}: could not save — ${dbError.message}`);
          failed++;
          continue;
        }

        if (prevOriginalPath) {
          try {
            await removeFile("originals", prevOriginalPath);
          } catch (e) {
            console.warn("failed to delete original after compression", prevOriginalPath, e);
          }
        }
        if (prevCompressedPath && prevCompressedPath !== outPath) {
          try {
            await removeFile("compressed", prevCompressedPath);
          } catch (e) {
            console.warn("failed to delete previous compressed file", prevCompressedPath, e);
          }
        }

        ok++;
      } catch (e) {
        console.error("compress failed for", img.id, e);
        toast.error(`Compression failed for ${label}`);
        failed++;
      } finally {
        done++;
        setProgress(done);
      }
    }

    if (ok > 0) toast.success(`${ok} image${ok === 1 ? "" : "s"} compressed`);
    if (skipped > 0) {
      toast.warning(
        `${skipped} image${skipped === 1 ? "" : "s"} over ${targetKB} KB — not saved. Try a higher limit or WebP.`,
        { duration: 7000 },
      );
    }
    if (failed > 0) {
      toast.error(`${failed} image${failed === 1 ? "" : "s"} failed. Adjust settings and try again.`, {
        duration: 7000,
      });
    }

    setRunning(false);

    if (ok > 0) {
      onDone();
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-2 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Compress {eligible.length} image{eligible.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Crop to 633×382 and compress. Uses the original when available; otherwise re-compresses the existing web image.
            The original is deleted after a successful run.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold uppercase tracking-wider text-muted-foreground">Target size</span>
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
                <SelectItem value="webp">WebP (recommended)</SelectItem>
                <SelectItem value="avif">AVIF</SelectItem>
                <SelectItem value="jpeg">JPG</SelectItem>
                <SelectItem value="png">PNG (lossless)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
            Output: <span className="text-foreground">633 × 382 px</span> · cover fill, center crop.
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
            {running
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Compressing</>
              : "Compress now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
