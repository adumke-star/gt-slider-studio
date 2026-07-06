import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { signedUrl } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { acceptWithoutCompression } from "@/lib/compressImage";
import type { SliderImage } from "./ImageCell";

type RaceLite = { id: string; name: string; series: string };

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
  const [progress, setProgress] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [phase, setPhase] = useState<"accept" | "download" | null>(null);
  const [running, setRunning] = useState(false);

  // The include-uncompressed confirmation shouldn't stick between exports.
  useEffect(() => {
    if (open) setIncludePending(false);
  }, [open]);

  const slideNo = (img: SliderImage) => slideNumbers[img.id] ?? img.position + 1;
  // Slider order: by section, then slide number — so ZIP entries and
  // sequential downloads follow the visible slot order.
  const bySliderOrder = (a: SliderImage, b: SliderImage) =>
    (a.section_id ?? "").localeCompare(b.section_id ?? "") || slideNo(a) - slideNo(b);
  const eligible = images.filter((i) => i.compressed_path).sort(bySliderOrder);
  // Uncompressed but with an original — can be accepted as final on the fly.
  const pending = images.filter((i) => !i.compressed_path && i.original_path);
  const skipped = images.length - eligible.length - pending.length;
  const exportCount = eligible.length + (includePending ? pending.length : 0);
  const raceMap = new Map(races.map((r) => [r.id, r]));

  function exportName(img: SliderImage) {
    const ext = img.format ? (img.format === "jpeg" ? "jpg" : img.format) : "webp";
    const race = raceMap.get(img.race_id);
    const slugTitle = img.title ? slugify(img.title) : "";
    const base = slugTitle
      || `${race ? slugify(race.name) : img.race_id.slice(0, 8)}_${img.area}_${String(img.position).padStart(2, "0")}`;
    const prefix = numbered ? `${String(slideNo(img)).padStart(2, "0")}_` : "";
    return `${prefix}${base}.${ext}`;
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
    const toExport = [...eligible];
    if (includePending && pending.length > 0) {
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
    setProgressTotal(toExport.length);
    setProgress(0);
    const results: { id: string; name: string; blob: Blob }[] = [];
    let done = 0;

    for (const img of toExport) {
      try {
        const url = await signedUrl("compressed", img.compressed_path!);
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        results.push({ id: img.id, name: exportName(img), blob });
      } catch (e) {
        console.error("export failed for", img.id, e);
        toast.error(`Export failed for image ${img.id.slice(0, 6)}`);
      }
      done++;
      setProgress(done);
    }

    if (results.length === 0) {
      toast.error("No images to download.");
      setRunning(false);
      setPhase(null);
      // Passthrough may already have changed data even if the download list is empty.
      if (includePending && pending.length > 0) onDone();
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

    try {
      if (asZip && results.length > 1) {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (const r of results) zip.file(uniqueName(r.name), r.blob);
        const zipBlob = await zip.generateAsync({ type: "blob" });
        triggerDownload(zipBlob, `slider-export-${Date.now()}.zip`);
      } else if (dirHandle) {
        for (const r of results) {
          const handle = await dirHandle.getFileHandle(uniqueName(r.name), { create: true });
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
        const { error } = await supabase
          .from("slider_images")
          .update({ status: "exported" })
          .in("id", results.map((r) => r.id));
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

      toast.success(`${results.length} image${results.length === 1 ? "" : "s"} saved`);
      setRunning(false);
      setPhase(null);
      onExported?.(results.map((r) => r.id));
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
            Export {exportCount} image{exportCount === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Download already compressed images (individually or as ZIP). Nothing is re-compressed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
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

          {pending.length > 0 && (
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

          {skipped > 0 && (
            <div className="rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
              {skipped} image{skipped === 1 ? "" : "s"} without any file will be skipped.
            </div>
          )}

          <div className="rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
            Ready to export: <span className="text-foreground">{exportCount}</span> of {images.length} selected.
          </div>
          {running && (
            <div className="text-sm text-primary">
              {phase === "accept" ? "Accepting as final" : "Loading"} {progress} / {progressTotal}…
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
