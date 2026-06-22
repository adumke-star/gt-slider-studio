import { useEffect, useRef, useState } from "react";
import { Send, Check, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/storage";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SliderImage } from "./ImageCell";

type Profile = { id: string; full_name: string | null; email: string; avatar_url: string | null };
type Comment = { id: string; author_id: string; body: string; created_at: string; resolved_at: string | null; resolved_by: string | null };
type Mention = { comment_id: string; mentioned_user_id: string };

// Mentions are stored as @[Name](user_id) tokens in the comment body.
const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-f-]+)\)/g;

function renderBody(body: string, profiles: Map<string, Profile>) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(body))) {
    if (m.index > last) out.push(body.slice(last, m.index));
    const name = profiles.get(m[2])?.full_name || m[1];
    out.push(
      <span key={`${m.index}`} className="rounded bg-primary/20 px-1 text-primary">
        @{name}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

export function CommentsSheet({
  image,
  open,
  onOpenChange,
}: {
  image: SliderImage | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<{ open: boolean; query: string; from: number }>({
    open: false, query: "", from: -1,
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
    supabase.rpc("get_public_profiles").then(({ data }) => {
      const list = ((data ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null }>)
        .map((p) => ({ ...p, email: "" })) as Profile[];
      setAllProfiles(list);
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

      const { data: cs } = await supabase
        .from("comments").select("*").eq("image_id", image.id).order("created_at");
      if (!alive) return;
      const list = (cs ?? []) as Comment[];
      setComments(list);
      if (list.length > 0) {
        const ids = list.map((c) => c.id);
        const { data: ms } = await supabase
          .from("comment_mentions").select("comment_id, mentioned_user_id").in("comment_id", ids);
        if (alive) setMentions((ms ?? []) as Mention[]);

        // Mark mentions for me as read
        if (meId) {
          await supabase.from("comment_mentions").update({ read_at: new Date().toISOString() })
            .in("comment_id", ids).eq("mentioned_user_id", meId).is("read_at", null);
        }
      } else setMentions([]);
    })();
    return () => { alive = false; };
  }, [image?.id, open, meId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [comments.length]);

  function onBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setBody(v);
    const pos = e.target.selectionStart ?? v.length;
    // find last '@' before cursor with no whitespace after
    const slice = v.slice(0, pos);
    const at = slice.lastIndexOf("@");
    if (at >= 0 && !/\s/.test(slice.slice(at + 1))) {
      setSuggest({ open: true, query: slice.slice(at + 1).toLowerCase(), from: at });
    } else {
      setSuggest({ open: false, query: "", from: -1 });
    }
  }

  function pickMention(p: Profile) {
    if (suggest.from < 0) return;
    const before = body.slice(0, suggest.from);
    const after = body.slice((inputRef.current?.selectionStart ?? body.length));
    const token = `@[${p.full_name || p.email}](${p.id}) `;
    const next = before + token + after;
    setBody(next);
    setSuggest({ open: false, query: "", from: -1 });
    setTimeout(() => {
      const pos = (before + token).length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  async function submit() {
    if (!image || !meId || !body.trim()) return;
    const text = body.trim();
    const mentionedIds = new Set<string>();
    let m: RegExpExecArray | null;
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(text))) mentionedIds.add(m[2]);

    const { data: ins, error } = await supabase
      .from("comments").insert({ image_id: image.id, author_id: meId, body: text }).select().single();
    if (error || !ins) return;
    if (mentionedIds.size > 0) {
      await supabase.from("comment_mentions").insert(
        Array.from(mentionedIds).map((uid) => ({ comment_id: ins.id, mentioned_user_id: uid })),
      );
    }
    setBody("");
    setComments((c) => [...c, ins as Comment]);
  }

  async function toggleResolved(c: Comment) {
    if (!meId) return;
    const nextResolved = c.resolved_at ? null : new Date().toISOString();
    const nextBy = c.resolved_at ? null : meId;
    setComments((list) => list.map((x) => x.id === c.id ? { ...x, resolved_at: nextResolved, resolved_by: nextBy } : x));
    await supabase.from("comments").update({ resolved_at: nextResolved, resolved_by: nextBy }).eq("id", c.id);
  }

  const filteredSuggest = suggest.open
    ? allProfiles.filter((p) => {
        const q = suggest.query;
        return (
          (p.full_name?.toLowerCase().includes(q) ?? false) ||
          p.email.toLowerCase().includes(q)
        );
      }).slice(0, 6)
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="text-sm font-bold uppercase tracking-wider">Comments</SheetTitle>
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
          {comments.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">No comments yet. Write the first one ↓</p>
          )}
          {comments.map((c) => {
            const author = profiles.get(c.author_id);
            const isMe = c.author_id === meId;
            const isResolved = !!c.resolved_at;
            return (
              <div key={c.id} className={cn("flex gap-2", isMe && "flex-row-reverse")}>
                <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface-2 text-[10px] font-bold uppercase">
                  {author?.avatar_url
                    ? <img src={author.avatar_url} alt="" className="h-full w-full object-cover" />
                    : (author?.full_name ?? author?.email ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div className={cn(
                  "group max-w-[80%] rounded-lg border px-3 py-2 text-sm",
                  isResolved ? "border-emerald-500/40 bg-emerald-500/10 opacity-70" :
                    isMe ? "bg-primary/10 border-primary/30" : "bg-surface-2 border-border",
                )}>
                  <div className="mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="truncate">{author?.full_name || author?.email || "—"}</span>
                    <span>·</span>
                    <span>{new Date(c.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>
                    {isResolved && <span className="text-emerald-500">· solved</span>}
                  </div>
                  <div className={cn("whitespace-pre-wrap break-words", isResolved && "line-through")}>{renderBody(c.body, profiles)}</div>
                  <button
                    onClick={() => toggleResolved(c)}
                    className={cn(
                      "mt-1.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider transition-colors",
                      isResolved
                        ? "border-border text-muted-foreground hover:bg-surface-2"
                        : "border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10",
                    )}
                  >
                    {isResolved ? <><RotateCcw className="h-3 w-3" /> Reopen</> : <><Check className="h-3 w-3" /> Solve</>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative border-t border-border bg-surface-2 p-3">
          {suggest.open && filteredSuggest.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-1 max-h-56 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
              {filteredSuggest.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pickMention(p)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  <div className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface-2 text-[10px] font-bold uppercase">
                    {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : (p.full_name ?? p.email).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate">{p.full_name || p.email}</div>
                    <div className="truncate text-xs text-muted-foreground">{p.email}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={body}
              onChange={onBodyChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape" && suggest.open) {
                  e.preventDefault();
                  setSuggest({ open: false, query: "", from: -1 });
                }
              }}
              rows={2}
              placeholder="Kommentar schreiben… nutze @ um jemanden zu markieren"
              className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <Button onClick={submit} disabled={!body.trim()} className="self-end gap-1">
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">⌘/Ctrl + Enter zum Senden</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
