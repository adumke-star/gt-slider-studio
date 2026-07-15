import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { transformImage, extForFormat, ENCODE_SHARPEN_AMOUNT, type ExportFormat } from "@/lib/imageProcess";
import { parseCropArea, resolveFocal } from "@/lib/cropUtils";
import { uploadFile, removeFile } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { acceptWithoutCompression, fetchCompressSource, isCompressEligible } from "@/lib/compressImage";
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
  const [format, setFormat] = useState<ExportFormat>("jpeg");
  const [sharpen, setSharpen] = useState(false);
  const [passthrough, setPassthrough] = useState(false);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);

  const eligible = images.filter(isCompressEligible);
  const passthroughEligible = images.filter((i) => i.original_path);
  const activeCount = passthrough ? passthroughEligible.length : eligible.length;

  async function runPassthrough() {
    setRunning(true);
    setProgress(0);
    let done = 0;
    let ok = 0;
    let failed = 0;

    for (const img of passthroughEligible) {
      const label = imageLabel(img);
      const result = await acceptWithoutCompression(img);
      switch (result.outcome) {
        case "ok":
          ok++;
          break;
        case "already-final":
          break;
        case "missing":
          toast.error(`${label}: image file not found in storage. Try re-uploading.`, { duration: 7000 });
          failed++;
          break;
        case "unsupported":
          toast.error(`${label}: format "${result.mime}" is not supported for export. Use Compress instead.`, {
            duration: 7000,
          });
          failed++;
          break;
        case "failed":
          toast.error(`${label}: could not save — ${result.message}`, { duration: 7000 });
          failed++;
          break;
      }
      done++;
      setProgress(done);
    }

    if (ok > 0) toast.success(`${ok} image${ok === 1 ? "" : "s"} accepted without re-compression`);
    if (failed > 0) {
      toast.error(`${failed} image${failed === 1 ? "" : "s"} failed.`, { duration: 7000 });
    }

    setRunning(false);
    if (ok > 0) {
      onDone();
      onOpenChange(false);
    }
  }

  async function run() {
    if (passthrough) {
      await runPassthrough();
      return;
    }
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
          toast.error(
            img.original_path
              ? `${label}: original master not found in storage. Try re-uploading.`
              : `${label}: image file not found in storage. Try re-uploading.`,
            { duration: 7000 },
          );
          failed++;
          continue;
        }

        const fromOriginal = source.from === "originals";

        const result = await transformImage(source.blob, {
          format,
          targetKB,
          width: 633,
          height: 382,
          cropArea: fromOriginal ? parseCropArea(img.crop_area) : null,
          focalPoint:
            fromOriginal && !parseCropArea(img.crop_area)
              ? resolveFocal(img.crop_x, img.crop_y)
              : undefined,
          sharpen: format !== "png" && sharpen ? ENCODE_SHARPEN_AMOUNT : undefined,
        });
        const { blob: out, mime, sizeKB, overTarget, downscaled } = result;

        if (overTarget) {
          toast.error(
            `${label}: could not reach ${targetKB} KB (${sizeKB} KB) — not saved.`,
            { duration: 7000 },
          );
          skipped++;
          continue;
        }

        if (downscaled) {
          toast.info(`${label}: resolution reduced to reach ${targetKB} KB.`);
        }

        const folder = img.section_id ?? img.area;
        const outPath = `${img.race_id}/${folder}/${img.id}.${ext}`;
        const prevCompressedPath = img.compressed_path;

        await uploadFile("compressed", outPath, out, mime);

        const { error: dbError } = await supabase.from("slider_images").update({
          compressed_path: outPath,
          compressed_size_kb: sizeKB,
          format,
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
        `${skipped} image${skipped === 1 ? "" : "s"} over ${targetKB} KB — not saved. Raise the limit or try WebP.`,
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
            Compress {activeCount} image{activeCount === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            {passthrough
              ? "Takes the uploaded files as-is for export — nothing is re-encoded. The working copy in originals is kept for later format changes."
              : "Crop to 633×382 and compress from the originals master when present — re-compress always re-renders from that file, not the existing web image. Without a master, falls back to the web image."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="flex items-center justify-between rounded border border-border bg-background/50 p-3">
            <label htmlFor="passthrough" className="pr-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Already compressed — accept without re-compression
            </label>
            <input
              id="passthrough"
              type="checkbox"
              checked={passthrough}
              onChange={(e) => setPassthrough(e.target.checked)}
              disabled={running}
              className="h-4 w-4 shrink-0 accent-primary"
            />
          </div>

          {passthrough ? (
            <div className="rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
              The uploaded file is made available for export unchanged — no cropping, no re-encoding
              (633 × 382 px recommended). Eligible: <span className="text-foreground">{passthroughEligible.length}</span> of {images.length} selected.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold uppercase tracking-wider text-muted-foreground">Max file size</span>
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
                    <SelectItem value="jpeg">JPG</SelectItem>
                    <SelectItem value="webp">WebP (recommended)</SelectItem>
                    <SelectItem value="avif">AVIF</SelectItem>
                    <SelectItem value="png">PNG (lossless)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {format !== "png" && (
                <div className="flex items-center justify-between rounded border border-border bg-background/50 p-3">
                  <label htmlFor="compress-sharpen" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Light sharpen
                  </label>
                  <input
                    id="compress-sharpen"
                    type="checkbox"
                    checked={sharpen}
                    onChange={(e) => setSharpen(e.target.checked)}
                    disabled={running}
                    className="h-4 w-4 accent-primary"
                  />
                </div>
              )}

              <div className="rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                Output: <span className="text-foreground">633 × 382 px</span> · cover fill, center crop.
                Fits under {targetKB} KB (may reduce quality or resolution). Re-compress uses the originals master.
                Eligible: <span className="text-foreground">{eligible.length}</span> of {images.length} selected.
              </div>
            </>
          )}
          {running && (
            <div className="text-sm text-primary">
              Processing {progress} / {activeCount}…
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>Cancel</Button>
          <Button onClick={run} disabled={running || activeCount === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            {running
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {passthrough ? "Accepting" : "Compressing"}</>
              : passthrough ? "Accept as final" : "Compress now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
