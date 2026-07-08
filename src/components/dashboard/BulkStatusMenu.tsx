import { useMemo, useState } from "react";
import { CircleDot } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BULK_STATUS_OPTIONS,
  bulkSetImageStatus,
  countImagesWithOpenComments,
  imagesEligibleForBulkStatus,
  type BulkStatus,
} from "@/lib/bulkImageStatus";
import type { SliderImage } from "./ImageCell";

type Pending = { status: BulkStatus; label: string };

export function BulkStatusMenu({
  images,
  scopeLabel,
  onDone,
  nested = false,
}: {
  images: SliderImage[];
  scopeLabel: string;
  onDone: () => void;
  /** When true, render as a submenu item inside a parent dropdown. */
  nested?: boolean;
}) {
  const eligible = useMemo(() => imagesEligibleForBulkStatus(images), [images]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [openComments, setOpenComments] = useState(0);
  const [busy, setBusy] = useState(false);

  async function pickStatus(status: BulkStatus, label: string) {
    if (eligible.length === 0) {
      toast.error("No images with files in this scope.");
      return;
    }
    setBusy(true);
    try {
      const commentCount = await countImagesWithOpenComments(eligible.map((i) => i.id));
      setOpenComments(commentCount);
      setPending({ status, label });
    } catch (e) {
      console.error(e);
      toast.error("Could not check comments");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      await bulkSetImageStatus(
        eligible.map((i) => i.id),
        pending.status,
      );
      toast.success(
        `Set ${eligible.length} image${eligible.length === 1 ? "" : "s"} to ${pending.label}`,
      );
      setPending(null);
      onDone();
    } catch (e) {
      console.error(e);
      toast.error(`Could not update status: ${(e as Error).message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  const statusItems = BULK_STATUS_OPTIONS.map((opt) => (
    <DropdownMenuItem
      key={opt.value}
      disabled={busy || eligible.length === 0}
      onSelect={(e) => {
        e.preventDefault();
        void pickStatus(opt.value, opt.label);
      }}
    >
      {opt.label}
    </DropdownMenuItem>
  ));

  const confirmDialog = (
    <AlertDialog open={pending != null} onOpenChange={(v) => { if (!busy && !v) setPending(null); }}>
      <AlertDialogContent className="bg-surface-2">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-xl">
            Set {eligible.length} image{eligible.length === 1 ? "" : "s"} to {pending?.label}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Scope: <span className="font-medium text-foreground">{scopeLabel}</span>
                {" — "}
                only slots with an uploaded file are included; empty placeholders stay unchanged.
              </p>
              {openComments > 0 && (
                <p className="text-[var(--status-changes)]">
                  {openComments} image{openComments === 1 ? "" : "s"} have open comments — status may be
                  reset by the comment workflow.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {busy ? "Updating…" : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (nested) {
    return (
      <>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={eligible.length === 0}>
            Set status for entire race
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>{statusItems}</DropdownMenuSubContent>
        </DropdownMenuSub>
        {confirmDialog}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            disabled={eligible.length === 0}
            className="h-7 gap-1 text-xs text-muted-foreground hover:bg-accent hover:text-black data-[state=open]:bg-accent data-[state=open]:text-black disabled:opacity-40"
            title="Set status for section"
          >
            <CircleDot className="h-3.5 w-3.5" />
            Status
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{statusItems}</DropdownMenuContent>
      </DropdownMenu>
      {confirmDialog}
    </>
  );
}
