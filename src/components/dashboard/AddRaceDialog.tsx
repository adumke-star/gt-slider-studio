import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AddRaceDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [series, setSeries] = useState<"f1" | "motogp">("f1");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setName(""); setDate(""); setSeries("f1"); } }, [open]);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: race } = await supabase.from("races").insert({
        name: name.trim(), series, race_date: date || null,
      }).select().single();
      if (race) {
        // seed 1 blank slot per area
        await supabase.from("slider_images").insert([
          { race_id: race.id, area: "plp", position: 0, status: "blank" },
          { race_id: race.id, area: "pdp", position: 0, status: "blank" },
        ]);
      }
      onCreated();
      onOpenChange(false);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-2 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-tight">New race</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Series</label>
            <Select value={series} onValueChange={(v) => setSeries(v as "f1" | "motogp")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="f1">Formula 1</SelectItem>
                <SelectItem value="motogp">MotoGP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Race name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Monaco Grand Prix" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Date (optional)</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !name.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
