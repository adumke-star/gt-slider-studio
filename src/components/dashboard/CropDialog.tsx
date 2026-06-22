import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area, type MediaSize } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  focalFromCroppedAreaPixels,
  SLIDER_ASPECT,
  type FocalPoint,
} from "@/lib/cropUtils";
import type { SliderImage } from "./ImageCell";

export function CropDialog({
  image,
  previewUrl,
  open,
  onOpenChange,
  onSaved,
}: {
  image: SliderImage;
  previewUrl: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (focal: FocalPoint) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setMediaSize(null);
    setCroppedAreaPixels(null);
  }, [open, image.id, previewUrl]);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function save() {
    if (!croppedAreaPixels || !mediaSize) {
      toast.error("Crop-Bereich noch nicht bereit — bitte kurz warten oder das Bild leicht verschieben.");
      return;
    }
    setSaving(true);
    try {
      const focal = focalFromCroppedAreaPixels(
        croppedAreaPixels,
        mediaSize.naturalWidth,
        mediaSize.naturalHeight,
      );
      const { data, error } = await supabase
        .from("slider_images")
        .update({ crop_x: focal.x, crop_y: focal.y })
        .eq("id", image.id)
        .select("crop_x, crop_y")
        .single();

      if (error) {
        if (error.message.includes("crop_x") && error.message.includes("does not exist")) {
          toast.error(
            "Crop-Spalten fehlen in der Datenbank. Bitte die Supabase-Migration ausführen (crop_x, crop_y auf slider_images).",
            { duration: 8000 },
          );
        } else {
          toast.error(`Crop konnte nicht gespeichert werden: ${error.message}`);
        }
        return;
      }
      if (!data) {
        toast.error("Crop konnte nicht gespeichert werden — keine Berechtigung oder Bild nicht gefunden.");
        return;
      }

      toast.success("Zuschnitt gespeichert");
      onSaved(focal);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Crop konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-2 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Zuschnitt für 633×382 festlegen</DialogTitle>
          <DialogDescription>
            Verschiebe und zoome das Bild. Nach dem Komprimieren ist der Zuschnitt endgültig.
          </DialogDescription>
        </DialogHeader>
        <div className="relative h-[min(50vh,320px)] w-full overflow-hidden rounded-md bg-background">
          <Cropper
            image={previewUrl}
            crop={crop}
            zoom={zoom}
            aspect={SLIDER_ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            onMediaLoaded={setMediaSize}
            objectFit="horizontal-cover"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button
            onClick={save}
            disabled={saving || !croppedAreaPixels || !mediaSize}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Speichern…</> : "Zuschnitt speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
