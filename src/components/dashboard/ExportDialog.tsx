import { useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { transformImage, extForFormat, type ExportFormat } from "@/lib/imageProcess";
import { signedUrl, uploadFile } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
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
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  images: SliderImage[];
  races?: RaceLite[];
  onDone: () => void;
}) {
  const [targetKB, setTargetKB] = useState(120);
  const [format, setFormat] = useState<ExportFormat>("webp");
  const [download, setDownload] = useState(true);
  const [asZip, setAsZip] = useState(true);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);

  const eligible = images.filter((i) => i.original_path);
  const raceMap = new Map(races.map((r) => [r.id, r]));

  async function run() {
    setRunning(true);
    setProgress(0);
    const ext = extForFormat(format);
    const results: { name: string; blob: Blob }[] = [];
    let done = 0;

    for (const img of eligible) {
      try {
        const origUrl = await signedUrl("originals", img.original_path!);
        if (!origUrl) continue;
        const blob = await (await fetch(origUrl)).blob();
        const { blob: out, mime, sizeKB } = await transformImage(blob, {
          format, targetKB, width: 633, height: 382,
        });
        const outPath = `${img.race_id}/${img.area}/${img.id}.${ext}`;
        await uploadFile("compressed", outPath, out, mime);
        await supabase.from("slider_images").update({
          compressed_path: outPath,
          compressed_size_kb: sizeKB,
          format,
          status: img.status === "live" ? "live" : "image_done",
        }).eq("id", img.id);

        const race = raceMap.get(img.race_id);
        const base = race ? slugify(race.name) : img.race_id.slice(0, 8);
        const name = `${base}_${img.area}_${String(img.position).padStart(2, "0")}.${ext}`;
        results.push({ name, blob: out });
      } catch (e) {
        console.error("export failed for", img.id, e);
        toast.error(`Export failed for image ${img.id.slice(0, 6)}`);
      }
      done++;
      setProgress(done);
    }

    // Local download
    if (download && results.length > 0) {
      try {
        if (asZip && results.length > 1) {
          const zip = new JSZip();
          // de-dupe filenames if necessary
          const used = new Map<string, number>();
          for (const r of results) {
            let n = r.name;
            const c = used.get(n) ?? 0;
            if (c > 0) {
              const dot = n.lastIndexOf(".");
              n = `${n.slice(0, dot)}-${c}${n.slice(dot)}`;
            }
            used.set(r.name, c + 1);
            zip.file(n, r.blob);
          }
          const zipBlob = await zip.generateAsync({ type: "blob" });
          triggerDownload(zipBlob, `slider-export-${Date.now()}.zip`);
        } else {
          for (const r of results) triggerDownload(r.blob, r.name);
        }
        toast.success(`${results.length} image${results.length === 1 ? "" : "s"} exported & downloaded`);
      } catch (e) {
        console.error(e);
        toast.error("Download failed");
      }
    } else if (results.length > 0) {
      toast.success(`${results.length} image${results.length === 1 ? "" : "s"} exported to cloud`);
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
          <DialogDescription>Resize to 633×382, compress and optionally download to your computer.</DialogDescription>
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

          <div className="space-y-3 rounded border border-border bg-background/50 p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="dl" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Download to computer
              </Label>
              <Switch id="dl" checked={download} onCheckedChange={setDownload} disabled={running} />
            </div>
            {download && eligible.length > 1 && (
              <div className="flex items-center justify-between">
                <Label htmlFor="zip" className="text-xs text-muted-foreground">
                  Bundle as ZIP
                </Label>
                <Switch id="zip" checked={asZip} onCheckedChange={setAsZip} disabled={running} />
              </div>
            )}
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
