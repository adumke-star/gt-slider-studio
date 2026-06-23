import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper, { type Area, type MediaSize } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  focalFromCroppedAreaPixels,
  parseCropArea,
  SLIDER_ASPECT,
  type CropAreaPercentages,
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
  onSaved: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null);
  const [croppedArea, setCroppedArea] = useState<CropAreaPercentages | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const savedCropArea = useMemo(() => parseCropArea(image.crop_area), [image.crop_area]);

  useEffect(() => {
    if (!open) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setMediaSize(null);
    setCroppedArea(savedCropArea);
    setCroppedAreaPixels(null);
  }, [open, image.id, previewUrl, savedCropArea]);

  const onCropComplete = useCallback((area: Area, pixels: Area) => {
    setCroppedArea({
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
    });
    setCroppedAreaPixels(pixels);
  }, []);

  async function save() {
    if (!croppedArea || !croppedAreaPixels || !mediaSize) {
      toast.error("Crop area not ready — wait a moment or move the image slightly.");
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
        .update({
          crop_area: croppedArea,
          crop_x: focal.x,
          crop_y: focal.y,
        })
        .eq("id", image.id)
        .select("crop_area, crop_x, crop_y")
        .single();

      if (error) {
        if (error.message.includes("crop_area") && error.message.includes("does not exist")) {
          toast.error(
            "Crop column is missing in the database. Please run: npx supabase db push",
            { duration: 8000 },
          );
        } else if (error.message.includes("crop_x") && error.message.includes("does not exist")) {
          toast.error(
            "Crop columns are missing in the database. Please run: npx supabase db push",
            { duration: 8000 },
          );
        } else {
          toast.error(`Could not save crop: ${error.message}`);
        }
        return;
      }
      if (!data) {
        toast.error("Could not save crop — no permission or image not found.");
        return;
      }

      toast.success("Crop saved");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Could not save crop");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-2 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Set crop for 633×382</DialogTitle>
          <DialogDescription>
            Pan and zoom the image. The crop is final after compression.
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
            objectFit="cover"
            initialCroppedAreaPercentages={savedCropArea ?? undefined}
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
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !croppedArea || !croppedAreaPixels || !mediaSize}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save crop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
