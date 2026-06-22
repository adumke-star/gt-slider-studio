import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { signedUrl } from "@/lib/storage";
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
  const [asZip, setAsZip] = useState(true);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);

  const eligible = images.filter((i) => i.compressed_path);
  const notCompressed = images.length - eligible.length;
  const raceMap = new Map(races.map((r) => [r.id, r]));

  function exportName(img: SliderImage) {
    const ext = img.format ? (img.format === "jpeg" ? "jpg" : img.format) : "webp";
    const race = raceMap.get(img.race_id);
    const slugTitle = img.title ? slugify(img.title) : "";
    const base = slugTitle
      || `${race ? slugify(race.name) : img.race_id.slice(0, 8)}_${img.area}_${String(img.position).padStart(2, "0")}`;
    return `${base}.${ext}`;
  }

  async function run() {
    const wantIndividual = !asZip || eligible.length === 1;
    const canUseFsApi = wantIndividual && eligible.length > 1 && "showDirectoryPicker" in window;

    // Ordnerauswahl muss innerhalb der User-Geste passieren (vor dem Laden der Blobs).
    let dirHandle: FileSystemDirectoryHandle | null = null;
    if (canUseFsApi) {
      try {
        dirHandle = await (window as unknown as {
          showDirectoryPicker: (o?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
        }).showDirectoryPicker({ mode: "readwrite" });
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return; // Nutzer hat abgebrochen
        dirHandle = null; // Fallback auf gestaffelte Einzeldownloads
      }
    }

    setRunning(true);
    setProgress(0);
    const results: { id: string; name: string; blob: Blob }[] = [];
    let done = 0;

    for (const img of eligible) {
      try {
        const url = await signedUrl("compressed", img.compressed_path!);
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        results.push({ id: img.id, name: exportName(img), blob });
      } catch (e) {
        console.error("export failed for", img.id, e);
        toast.error(`Export fehlgeschlagen für Bild ${img.id.slice(0, 6)}`);
      }
      done++;
      setProgress(done);
    }

    if (results.length === 0) {
      toast.error("Keine Bilder zum Herunterladen.");
      setRunning(false);
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
        // Browser blockieren mehrere gleichzeitige Downloads — daher gestaffelt
        for (let i = 0; i < results.length; i++) {
          triggerDownload(results[i].blob, uniqueName(results[i].name));
          if (i < results.length - 1) {
            await new Promise((r) => setTimeout(r, 600));
          }
        }
      }
      // Status der exportierten Bilder auf "exported" setzen (Export selbst nicht blockieren)
      try {
        const { error } = await supabase
          .from("slider_images")
          .update({ status: "exported" })
          .in("id", results.map((r) => r.id));
        if (error) {
          console.error("status update failed", error);
          if (error.message.includes("exported") || error.message.includes("invalid input value")) {
            toast.warning(
              'Status "Exported" fehlt noch in der Datenbank. Bitte die Migration ausführen (image_status um "exported" erweitern).',
              { duration: 8000 },
            );
          }
        }
      } catch (e) {
        console.error(e);
      }

      toast.success(`${results.length} Bild${results.length === 1 ? "" : "er"} gespeichert`);
      setRunning(false);
      onDone();
      onOpenChange(false);
      return;
    } catch (e) {
      console.error(e);
      toast.error("Download fehlgeschlagen");
    }

    setRunning(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-2 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Export {eligible.length} Bild{eligible.length === 1 ? "" : "er"}
          </DialogTitle>
          <DialogDescription>
            Bereits komprimierte Bilder herunterladen (einzeln oder als ZIP). Es wird nichts neu komprimiert.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {eligible.length > 1 && (
            <div className="flex items-center justify-between rounded border border-border bg-background/50 p-3">
              <label htmlFor="zip" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Als ZIP bündeln
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

          {eligible.length > 1 && !asZip && (
            <div className="rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
              {"showDirectoryPicker" in window
                ? "Du wirst nach einem Zielordner gefragt – alle Bilder werden direkt dort gespeichert."
                : "Dein Browser lädt die Bilder einzeln herunter und fragt ggf. einmalig, ob mehrere Dateien erlaubt sind."}
            </div>
          )}

          {notCompressed > 0 && (
            <div className="rounded border border-[var(--status-todo)]/40 bg-[var(--status-todo)]/10 p-3 text-xs text-[var(--status-todo)]">
              {notCompressed} von {images.length} Bildern sind noch nicht komprimiert und werden nicht exportiert. Bitte zuerst „Compress“ ausführen.
            </div>
          )}

          <div className="rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
            Bereit zum Export: <span className="text-foreground">{eligible.length}</span> von {images.length} ausgewählt.
          </div>
          {running && (
            <div className="text-sm text-primary">
              Lade {progress} / {eligible.length}…
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>Schließen</Button>
          <Button onClick={run} disabled={running || eligible.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            {running
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exportiere</>
              : "Jetzt herunterladen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
