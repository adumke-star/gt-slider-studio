import { useEffect, useRef, useState } from "react";
import { Send, Star, Pencil, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/storage";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isSuperuserEmail } from "@/lib/roles";
import {
  addFeedback,
  deleteFeedback,
  listFeedback,
  updateFeedback,
  type FeedbackRow,
} from "@/lib/feedback";
import type { SliderImage } from "./ImageCell";

type Profile = { id: string; full_name: string | null; avatar_url: string | null };

/**
 * Confidential jury feedback on a slot. Status-neutral (unlike comments) and
 * only reachable for jury members / the primary admin — RLS enforces this.
 */
export function FeedbackSheet({
  image,
  open,
  onOpenChange,
  onChanged,
}: {
  image: SliderImage | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMeId(data.user?.id ?? null);
      setIsPrimaryAdmin(isSuperuserEmail(data.user?.email ?? ""));
    });
    supabase.rpc("get_public_profiles").then(({ data }) => {
      const list = (data ?? []) as Profile[];
      setProfiles(new Map(list.map((p) => [p.id, p])));
    });
  }, []);

  useEffect(() => {
    if (!image || !open) return;
    let alive = true;
    (async () => {
      const path = image.compressed_path || image.original_path;
      if (path) {
        const bucket = image.compressed_path ? "compressed" : "originals";
        const url = await signedUrl(bucket, path);
        if (alive) setPreview(url);
      } else if (alive) setPreview(null);

      try {
        const list = await listFeedback(image.id);
        if (alive) setItems(list);
      } catch (e) {
        if (alive) toast.error(`Could not load feedback: ${(e as Error).message}`);
      }
    })();
    return () => { alive = false; };
  }, [image?.id, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items.length]);

  async function submit() {
    if (!image || !body.trim()) return;
    try {
      const row = await addFeedback(image.id, body.trim());
      setBody("");
      setItems((list) => [...list, row]);
      onChanged?.();
    } catch (e) {
      toast.error(`Could not save feedback: ${(e as Error).message}`);
    }
  }

  function startEdit(f: FeedbackRow) {
    setEditingId(f.id);
    setEditDraft(f.body);
  }

  async function saveEdit() {
    const id = editingId;
    const text = editDraft.trim();
    if (!id || !text) return;
    try {
      await updateFeedback(id, text);
      setItems((list) => list.map((x) =>
        x.id === id ? { ...x, body: text, updated_at: new Date().toISOString() } : x,
      ));
      setEditingId(null);
      onChanged?.();
    } catch (e) {
      toast.error(`Could not save changes: ${(e as Error).message}`);
    }
  }

  async function remove(f: FeedbackRow) {
    if (!confirm("Delete this feedback?")) return;
    try {
      await deleteFeedback(f.id);
      setItems((list) => list.filter((x) => x.id !== f.id));
      onChanged?.();
    } catch (e) {
      toast.error(`Could not delete: ${(e as Error).message}`);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
            <Star className="h-4 w-4 text-amber-400" /> Jury feedback
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Confidential — visible to jury members only. Does not affect the slot status.
          </p>
        </SheetHeader>

        {image && (
          <div className="border-b border-border bg-surface-2 p-3">
            <div className="flex gap-3">
              <div className="h-16 w-24 shrink-0 overflow-hidden rounded border border-border bg-background">
                {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{image.title || "Untitled slot"}</div>
                <div className="text-xs text-muted-foreground">
                  {image.area.toUpperCase()} · Position {image.position}
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {items.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">No feedback yet. Write the first one ↓</p>
          )}
          {items.map((f) => {
            const author = f.author_id ? profiles.get(f.author_id) : undefined;
            const authorName = f.author_id ? (author?.full_name || "—") : "Former member";
            const isMe = f.author_id !== null && f.author_id === meId;
            const canDelete = isMe || isPrimaryAdmin;
            const edited = new Date(f.updated_at).getTime() - new Date(f.created_at).getTime() > 1500;
            const isEditing = editingId === f.id;
            return (
              <div key={f.id} className={cn("flex gap-2", isMe && "flex-row-reverse")}>
                <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface-2 text-[10px] font-bold uppercase">
                  {author?.avatar_url
                    ? <img src={author.avatar_url} alt="" className="h-full w-full object-cover" />
                    : authorName.slice(0, 2).toUpperCase()}
                </div>
                <div className={cn(
                  "group max-w-[80%] rounded-lg border px-3 py-2 text-sm",
                  isMe ? "bg-amber-500/10 border-amber-500/30" : "bg-surface-2 border-border",
                )}>
                  <div className="mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="truncate">{authorName}</span>
                    <span>·</span>
                    <span>{new Date(f.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>
                    {edited && <span>· edited</span>}
                  </div>

                  {isEditing ? (
                    <div className="mt-1">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        rows={3}
                        autoFocus
                        className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                      />
                      <div className="mt-1 flex justify-end gap-1">
                        <button
                          onClick={() => setEditingId(null)}
                          className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-surface-2"
                        >
                          <X className="h-3 w-3" /> Cancel
                        </button>
                        <button
                          onClick={saveEdit}
                          disabled={!editDraft.trim()}
                          className="inline-flex items-center gap-1 rounded border border-primary/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-primary hover:bg-primary/10 disabled:opacity-40"
                        >
                          <Check className="h-3 w-3" /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{f.body}</div>
                  )}

                  {!isEditing && (isMe || canDelete) && (
                    <div className="mt-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {isMe && (
                        <button
                          onClick={() => startEdit(f)}
                          title="Edit"
                          className="rounded p-0.5 text-muted-foreground hover:text-primary"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => remove(f)}
                          title="Delete"
                          className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border bg-surface-2 p-3">
          <div className="flex gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder="Write feedback…"
              className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <Button onClick={submit} disabled={!body.trim()} className="self-end gap-1">
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">⌘/Ctrl + Enter to send</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
