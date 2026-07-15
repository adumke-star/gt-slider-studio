import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { signedUrl } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { acceptWithoutCompression } from "@/lib/compressImage";
import { transformImage, extForFormat, type ExportFormat } from "@/lib/imageProcess";
import { parseCropArea, resolveFocal } from "@/lib/cropUtils";
import type { SliderImage } from "./ImageCell";
import { isRealImageSlot } from "@/lib/placeholderSlots";

type RaceLite = { id: string; name: string; series: string };

type ExportSize = "633" | "960" | "both";

/** Lightbox output: same aspect ratio as the 633x382 slider images. */
const LIGHTBOX_WIDTH = 960;
const LIGHTBOX_HEIGHT = 579;
const SLIDER_SIZE_LABEL = "633x382";
const LIGHTBOX_SIZE_LABEL = "960x579";

/**
 * Lightbox format follows the existing 633 image; avif/unknown fall back to
 * WebP because browser AVIF encoding silently degrades to PNG.
 */
function lightboxFormat(img: SliderImage): ExportFormat {
  const f = img.format;
  if (f === "jpeg" || f === "png" || f === "webp") return f;
  return "webp";
}

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "race";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ExportDialog({
  open,
  onOpenChange,
  images,
  races = [],
  slideNumbers = {},
  canEdit = false,
  onDone,
  onExported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  images: SliderImage[];
  races?: RaceLite[];
  /** 1-based slide number per image id (slider order within its section). */
  slideNumbers?: Record<string, number>;
  /** Editors can accept uncompressed images as final during export. */
  canEdit?: boolean;
  onDone: () => void;
  /** Called with the exported image ids after a successful export. */
  onExported?: (ids: string[]) => void;
}) {
  const [asZip, setAsZip] = useState(true);
  const [numbered, setNumbered] = useState(true);
  const [includePending, setIncludePending] = useState(false);
  const [size, setSize] = useState<ExportSize>("633");
  const [lightboxKB, setLightboxKB] = useState(250);
  const [progress, setProgress] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [phase, setPhase] = useState<"accept" | "download" | null>(null);
  const [running, setRunning] = useState(false);

  // The include-uncompressed confirmation shouldn't stick between exports.
  useEffect(() => {
    if (open) setIncludePending(false);
  }, [open]);

  const realImages = images.filter(isRealImageSlot);
  const slideNo = (img: SliderImage) => slideNumbers[img.id] ?? img.position + 1;
  // Slider order: by section, then slide number — so ZIP entries and
  // sequential downloads follow the visible slot order.
  const bySliderOrder = (a: SliderImage, b: SliderImage) =>
    (a.section_id ?? "").localeCompare(b.section_id ?? "") || slideNo(a) - slideNo(b);
  const include633 = size !== "960";
  const include960 = size !== "633";

  const eligible = realImages.filter((i) => i.compressed_path).sort(bySliderOrder);
  // Uncompressed but with an original — can be accepted as final on the fly.
  const pending = realImages.filter((i) => !i.compressed_path && i.original_path);
  const skipped = realImages.length - eligible.length - pending.length;
  // Lightbox versions are rendered fresh from the 2000px working copy.
  const eligible960 = realImages.filter((i) => i.original_path).sort(bySliderOrder);
  const missing960 = realImages.length - eligible960.length;
  const count633 = include633 ? eligible.length + (includePending ? pending.length : 0) : 0;
  const count960 = include960 ? eligible960.length : 0;
  const exportCount = count633 + count960;
  const raceMap = new Map(races.map((r) => [r.id, r]));

  function exportName(img: SliderImage, sizeLabel: string, extOverride?: string) {
    const ext = extOverride ?? (img.format ? (img.format === "jpeg" ? "jpg" : img.format) : "webp");
    const race = raceMap.get(img.race_id);
    const slugTitle = img.title ? slugify(img.title) : "";
    const base = slugTitle
      || `${race ? slugify(race.name) : img.race_id.slice(0, 8)}_${img.area}_${String(img.position).padStart(2, "0")}`;
    const prefix = numbered ? `${String(slideNo(img)).padStart(2, "0")}_` : "";
    return `${prefix}${base}_${sizeLabel}.${ext}`;
  }

  async function run() {
    const wantIndividual = !asZip || exportCount === 1;
    const canUseFsApi = wantIndividual && exportCount > 1 && "showDirectoryPicker" in window;

    let dirHandle: FileSystemDirectoryHandle | null = null;
    if (canUseFsApi) {
      try {
        dirHandle = await (window as unknown as {
          showDirectoryPicker: (o?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
        }).showDirectoryPicker({ mode: "readwrite" });
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
        dirHandle = null;
      }
    }

    setRunning(true);
    setProgress(0);

    // Optionally accept uncompressed originals as final first (no re-compression).
    const toExport = include633 ? [...eligible] : [];
    if (include633 && includePending && pending.length > 0) {
      setPhase("accept");
      setProgressTotal(pending.length);
      let done = 0;
      let failed = 0;
      for (const img of pending) {
        try {
          const res = await acceptWithoutCompression(img);
          if (res.outcome === "ok") {
            toExport.push({ ...img, compressed_path: res.path, format: res.format });
          } else {
            failed++;
            console.error("passthrough failed for", img.id, res);
          }
        } catch (e) {
          failed++;
          console.error("passthrough failed for", img.id, e);
        }
        done++;
        setProgress(done);
      }
      if (failed > 0) {
        toast.error(`${failed} image${failed === 1 ? "" : "s"} could not be accepted as final and will be skipped.`);
      }
      toExport.sort(bySliderOrder);
    }

    setPhase("download");
    const lightboxList = include960 ? eligible960 : [];
    setProgressTotal(toExport.length + lightboxList.length);
    setProgress(0);
    // folder is only set when both sizes are exported together.
    const results: { id: string; folder: "slider" | "lightbox" | null; name: string; blob: Blob }[] = [];
    let done = 0;

    for (const img of toExport) {
      try {
        const url = await signedUrl("compressed", img.compressed_path!);
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        results.push({ id: img.id, folder: size === "both" ? "slider" : null, name: exportName(img, SLIDER_SIZE_LABEL), blob });
      } catch (e) {
        console.error("export failed for", img.id, e);
        toast.error(`Export failed for image ${img.id.slice(0, 6)}`);
      }
      done++;
      setProgress(done);
    }

    // Lightbox size: rendered fresh from the original (read-only, nothing is
    // written back to storage — the 2000px working copy stays untouched).
    let lightboxOverTarget = 0;
    for (const img of lightboxList) {
      try {
        const url = await signedUrl("originals", img.original_path!);
        if (!url) {
          toast.error(`${img.title || img.id.slice(0, 6)}: original file not found — lightbox version skipped.`, { duration: 7000 });
          done++;
          setProgress(done);
          continue;
        }
        const srcBlob = await (await fetch(url)).blob();
        const fmt = lightboxFormat(img);
        const cropArea = parseCropArea(img.crop_area);
        const out = await transformImage(srcBlob, {
          format: fmt,
          targetKB: lightboxKB,
          width: LIGHTBOX_WIDTH,
          height: LIGHTBOX_HEIGHT,
          cropArea,
          focalPoint: cropArea ? undefined : resolveFocal(img.crop_x, img.crop_y),
        });
        if (out.overTarget) {
          lightboxOverTarget++;
          done++;
          setProgress(done);
          continue;
        }
        results.push({
          id: img.id,
          folder: size === "both" ? "lightbox" : null,
          name: exportName(img, LIGHTBOX_SIZE_LABEL, extForFormat(fmt)),
          blob: out.blob,
        });
      } catch (e) {
        console.error("lightbox export failed for", img.id, e);
        toast.error(`Lightbox export failed for image ${img.id.slice(0, 6)}`);
      }
      done++;
      setProgress(done);
    }

    if (lightboxOverTarget > 0) {
      toast.warning(
        `${lightboxOverTarget} lightbox image${lightboxOverTarget === 1 ? "" : "s"} could not reach ${lightboxKB} KB — skipped. Try a higher limit.`,
        { duration: 7000 },
      );
    }

    if (results.length === 0) {
      toast.error("No images to download.");
      setRunning(false);
      setPhase(null);
      // Passthrough may already have changed data even if the download list is empty.
      if (include633 && includePending && pending.length > 0) onDone();
      return;
    }

    const used = new Map<string, number>();
    const uniqueName = (name: string) => {
      const c = used.get(name) ?? 0;
      used.set(name, c + 1);
      if (c === 0) return name;
      const dot = name.lastIndexOf(".");
      return dot < 0 ? `${name}-${c}` : `${name.slice(0, dot)}-${c}${name.slice(dot)}`;
    };
    // ZIP / folder picker: slider/ and lightbox/ subfolders when both sizes.
    // Filenames always include the pixel dimensions (e.g. _633x382, _960x579).
    const zipName = (r: (typeof results)[number]) => uniqueName(r.folder ? `${r.folder}/${r.name}` : r.name);

    try {
      if (asZip && results.length > 1) {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (const r of results) zip.file(zipName(r), r.blob);
        const zipBlob = await zip.generateAsync({ type: "blob" });
        triggerDownload(zipBlob, `slider-export-${Date.now()}.zip`);
      } else if (dirHandle) {
        for (const r of results) {
          const parent = r.folder
            ? await dirHandle.getDirectoryHandle(r.folder, { create: true })
            : dirHandle;
          const handle = await parent.getFileHandle(uniqueName(r.name), { create: true });
          const writable = await handle.createWritable();
          await writable.write(r.blob);
          await writable.close();
        }
      } else {
        for (let i = 0; i < results.length; i++) {
          triggerDownload(results[i].blob, uniqueName(results[i].name));
          if (i < results.length - 1) {
            await new Promise((r) => setTimeout(r, 600));
          }
        }
      }
      try {
        const exportedIds = Array.from(new Set(results.map((r) => r.id)));
        const { error } = await supabase
          .from("slider_images")
          .update({ status: "exported" })
          .in("id", exportedIds);
        if (error) {
          console.error("status update failed", error);
          if (error.message.includes("exported") || error.message.includes("invalid input value")) {
            toast.warning(
              'Status "Exported" is missing in the database. Please run the migration (add "exported" to image_status).',
              { duration: 8000 },
            );
          }
        }
      } catch (e) {
        console.error(e);
      }

      toast.success(`${results.length} file${results.length === 1 ? "" : "s"} saved`);
      setRunning(false);
      setPhase(null);
      onExported?.(Array.from(new Set(results.map((r) => r.id))));
      onDone();
      onOpenChange(false);
      return;
    } catch (e) {
      console.error(e);
      toast.error("Download failed");
    }

    setRunning(false);
    setPhase(null);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-2 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Export {exportCount} file{exportCount === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            {include960
              ? "633 images download as-is; 960 lightbox images are rendered fresh from the originals (nothing is written back to storage)."
              : "Download already compressed images (individually or as ZIP). Nothing is re-compressed."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Size</div>
            <Select value={size} onValueChange={(v) => setSize(v as ExportSize)} disabled={running}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="633">633 × 382 (Slider)</SelectItem>
                <SelectItem value="960">960 × 579 (Lightbox)</SelectItem>
                <SelectItem value="both">Both sizes</SelectItem>
              </SelectContent>
            </Select>
            {size === "both" && asZip && (
              <p className="text-[10px] text-muted-foreground">
                ZIP: <span className="text-foreground">slider/</span> (_633x382) and <span className="text-foreground">lightbox/</span> (_960x579).
              </p>
            )}
          </div>

          {include960 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold uppercase tracking-wider text-muted-foreground">Lightbox target size</span>
                <span className="font-display text-lg text-primary">{lightboxKB} KB</span>
              </div>
              <Slider value={[lightboxKB]} min={50} max={1000} step={10}
                onValueChange={([v]) => setLightboxKB(v)} disabled={running} />
              <p className="text-[10px] text-muted-foreground">
                960 × 579 px · same crop as the slider image · format follows the slider image (AVIF falls back to WebP).
              </p>
            </div>
          )}

          {include960 && missing960 > 0 && (
            <div className="rounded border border-[var(--status-todo)]/40 bg-[var(--status-todo)]/10 p-3 text-xs text-[var(--status-todo)]">
              {missing960} image{missing960 === 1 ? "" : "s"} without an original file — the lightbox version will be skipped for {missing960 === 1 ? "it" : "them"}.
            </div>
          )}

          {exportCount > 1 && (
            <div className="flex items-center justify-between rounded border border-border bg-background/50 p-3">
              <label htmlFor="zip" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Bundle as ZIP
              </label>
              <input
                id="zip"
                type="checkbox"
                checked={asZip}
                onChange={(e) => setAsZip(e.target.checked)}
                disabled={running}
                className="h-4 w-4 accent-primary"
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded border border-border bg-background/50 p-3">
            <label htmlFor="numbered" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Number files by slide order (01_, 02_, …)
            </label>
            <input
              id="numbered"
              type="checkbox"
              checked={numbered}
              onChange={(e) => setNumbered(e.target.checked)}
              disabled={running}
              className="h-4 w-4 accent-primary"
            />
          </div>

          {exportCount > 1 && !asZip && (
            <div className="rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
              {"showDirectoryPicker" in window
                ? "You will be asked for a destination folder — all images will be saved there directly."
                : "Your browser will download images one by one and may ask once whether multiple downloads are allowed."}
            </div>
          )}

          {include633 && pending.length > 0 && (
            <div className="space-y-2 rounded border border-[var(--status-todo)]/40 bg-[var(--status-todo)]/10 p-3">
              <p className="text-xs text-[var(--status-todo)]">
                {pending.length} of {images.length} images {pending.length === 1 ? "is" : "are"} not compressed yet
                {canEdit ? "." : " and will be skipped. Please run Compress first."}
              </p>
              {canEdit && (
                <label className="flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
                  <input
                    type="checkbox"
                    checked={includePending}
                    onChange={(e) => setIncludePending(e.target.checked)}
                    disabled={running}
                    className="h-4 w-4 accent-primary"
                  />
                  Already compressed — accept as final without re-compression and include
                </label>
              )}
            </div>
          )}

          {include633 && skipped > 0 && (
            <div className="rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
              {skipped} image{skipped === 1 ? "" : "s"} without any file will be skipped.
            </div>
          )}

          <div className="rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
            Ready to export: <span className="text-foreground">{exportCount}</span> file{exportCount === 1 ? "" : "s"}
            {size === "both"
              ? <> ({count633} slider + {count960} lightbox)</>
              : <> of {images.length} selected</>}.
          </div>
          {running && (
            <div className="text-sm text-primary">
              {phase === "accept" ? "Accepting as final" : "Processing"} {progress} / {progressTotal}…
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>Close</Button>
          <Button onClick={run} disabled={running || exportCount === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            {running
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exporting</>
              : "Download now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
