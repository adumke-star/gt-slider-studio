import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, HardDriveDownload, HardDriveUpload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  createFullBackupZip,
  existingRaceIds,
  expectedFileCount,
  fullBackupFileName,
  raceExists,
  readBackup,
  reuploadRaceFilesFromArchive,
  restoreFullBackup,
  restoreRaceBackup,
  type BackupArchive,
} from "@/lib/raceBackup";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/backup")({
  head: () => ({ meta: [{ title: "Backup — Slider Studio" }] }),
  component: BackupPage,
});

function BackupPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restoreArchive, setRestoreArchive] = useState<BackupArchive | null>(null);
  // For race backups: whether the race still exists. For full backups: how many still exist.
  const [restoreExists, setRestoreExists] = useState(false);
  const [restoreExistingCount, setRestoreExistingCount] = useState(0);
  const [restoreRunning, setRestoreRunning] = useState(false);
  const [reuploadRunning, setReuploadRunning] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
    })();
  }, []);

  async function runBackup() {
    setBackupRunning(true);
    setBackupMsg("Starting…");
    try {
      const { blob, manifest, failures } = await createFullBackupZip((msg) => setBackupMsg(msg));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fullBackupFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      const { races, images, files_saved, files_failed } = manifest.counts;
      if (files_failed > 0) {
        toast.error(
          `Backup incomplete: ${files_failed} of ${files_saved + files_failed} image files could not be downloaded ` +
          `(first error: ${failures[0]?.error ?? "unknown"}). The ZIP is missing these images — do not rely on it for restore.`,
          { duration: 15000 },
        );
      } else {
        toast.success(`Backup ready: ${races} races, ${images} slots, ${files_saved} files`);
      }
    } catch (e) {
      console.error(e);
      toast.error(`Backup failed: ${(e as Error).message ?? e}`);
    } finally {
      setBackupRunning(false);
      setBackupMsg(null);
    }
  }

  async function pickRestoreFile(file: File) {
    setRestoreArchive(null);
    try {
      const archive = await readBackup(file);
      if (archive.kind === "race") {
        setRestoreExists(await raceExists(archive.manifest.race.id));
        setRestoreExistingCount(0);
      } else {
        const existing = await existingRaceIds(archive.manifest.races.map((r) => r.id));
        setRestoreExists(existing.size > 0);
        setRestoreExistingCount(existing.size);
      }
      setRestoreArchive(archive);
    } catch (e) {
      toast.error(`Could not read backup: ${(e as Error).message ?? e}`, { duration: 8000 });
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  }

  async function runReuploadFiles() {
    if (!restoreArchive || restoreArchive.kind !== "race") return;
    if (!restoreExists) {
      toast.error("Race does not exist yet — use full restore first.");
      return;
    }
    if (restoreArchive.files.length === 0) {
      toast.error("This backup ZIP contains no image files.");
      return;
    }
    if (!confirm(
      `Re-upload ${restoreArchive.files.length} image files for "${restoreArchive.manifest.race.name}"? ` +
      "Database rows (sections, slots, statuses) stay unchanged.",
    )) {
      return;
    }

    setReuploadRunning(true);
    setRestoreMsg("Starting…");
    try {
      const result = await reuploadRaceFilesFromArchive(restoreArchive, setRestoreMsg);
      if (result.files_failed > 0) {
        toast.error(
          `${result.files_failed} of ${result.files_uploaded + result.files_failed} files failed to upload ` +
          `(first error: ${result.file_failures[0]?.error ?? "unknown"}).`,
          { duration: 15000 },
        );
      } else {
        toast.success(
          `Re-uploaded ${result.files_uploaded} image files for "${restoreArchive.manifest.race.name}". ` +
          "Reload the dashboard to refresh previews.",
          { duration: 10000 },
        );
      }
    } catch (e) {
      console.error("re-upload failed", e);
      toast.error(`Re-upload failed: ${(e as Error).message ?? e}`, { duration: 10000 });
    } finally {
      setReuploadRunning(false);
      setRestoreMsg(null);
    }
  }

  async function runRestore() {
    if (!restoreArchive) return;

    if (restoreArchive.kind === "race") {
      if (restoreExists) {
        const name = restoreArchive.manifest.race.name;
        if (!confirm(`Race "${name}" already exists. Replace it with the backup? The current state (including images) will be deleted.`)) {
          return;
        }
      }
    } else {
      const total = restoreArchive.manifest.races.length;
      const created = total - restoreExistingCount;
      if (!confirm(
        `Restore full backup: ${restoreExistingCount} race${restoreExistingCount === 1 ? "" : "s"} will be replaced with the backup state` +
        `${created > 0 ? ` and ${created} deleted race${created === 1 ? "" : "s"} recreated` : ""}. ` +
        `Races that are not in the backup stay untouched. Continue?`,
      )) {
        return;
      }
    }

    setRestoreRunning(true);
    setRestoreMsg("Starting…");
    try {
      if (restoreArchive.kind === "race") {
        const result = await restoreRaceBackup(restoreArchive, { replace: restoreExists }, setRestoreMsg);
        if (result.files_failed > 0) {
          toast.error(
            `Race "${restoreArchive.manifest.race.name}" restored, but ${result.files_failed} of ` +
            `${result.files_uploaded + result.files_failed} image files failed to upload ` +
            `(first error: ${result.file_failures[0]?.error ?? "unknown"}).`,
            { duration: 15000 },
          );
        } else {
          toast.success(
            `Race "${restoreArchive.manifest.race.name}" restored: ${result.sections} sections, ${result.images} slots, ` +
            `${result.files_uploaded} files` +
            `${result.comments_skipped ? ` — ${result.comments_skipped} comments skipped` : ""}`,
            { duration: 8000 },
          );
        }
      } else {
        const result = await restoreFullBackup(restoreArchive, setRestoreMsg);
        if (result.files_failed > 0) {
          toast.error(
            `Full backup restored, but ${result.files_failed} of ${result.files_uploaded + result.files_failed} ` +
            `image files failed to upload (first error: ${result.file_failures[0]?.error ?? "unknown"}).`,
            { duration: 15000 },
          );
        } else {
          toast.success(
            `Full backup restored: ${result.races_replaced} races replaced, ${result.races_created} recreated, ` +
            `${result.images} slots, ${result.files_uploaded} files` +
            `${result.comments_skipped ? ` — ${result.comments_skipped} comments skipped` : ""}`,
            { duration: 10000 },
          );
        }
      }
      setRestoreArchive(null);
    } catch (e) {
      console.error("restore failed", e);
      toast.error(`Restore failed: ${(e as Error).message ?? e}`, { duration: 10000 });
    } finally {
      setRestoreRunning(false);
      setRestoreMsg(null);
    }
  }

  if (isAdmin === false) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground">
        <div>
          <h1 className="font-display text-2xl uppercase">No access</h1>
          <p className="mt-2 text-sm text-muted-foreground">This page is for admins only.</p>
          <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">← Back to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface-2/95">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <h1 className="ml-auto font-display text-lg font-black uppercase">Backup</h1>
          <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">Allowlist →</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-6">
        <section className="rounded-lg border border-border bg-surface-2 p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Full backup</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runBackup} disabled={backupRunning} className="gap-1.5">
              {backupRunning
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating backup…</>
                : <><HardDriveDownload className="h-4 w-4" /> Download backup (ZIP)</>}
            </Button>
            {backupRunning && backupMsg && (
              <span className="text-xs text-muted-foreground">{backupMsg}</span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Downloads every race — sections, slots, statuses, comments, allowlist and all image files —
            as one restorable ZIP. Upload it below to bring everything back. Keep the file somewhere safe (e.g. Drive).
          </p>
        </section>

        <section className="rounded-lg border border-border bg-surface-2 p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Restore from backup</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={restoreInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && pickRestoreFile(e.target.files[0])}
            />
            <Button
              variant="outline"
              onClick={() => restoreInputRef.current?.click()}
              disabled={restoreRunning || reuploadRunning}
              className="gap-1.5"
            >
              <HardDriveUpload className="h-4 w-4" /> Choose backup ZIP
            </Button>
            {restoreArchive && !restoreRunning && !reuploadRunning && (
              <Button onClick={runRestore} className="gap-1.5">
                {restoreArchive.kind === "full"
                  ? "Restore full backup"
                  : restoreExists ? "Replace existing race" : "Restore race"}
              </Button>
            )}
            {restoreArchive?.kind === "race" && restoreExists && !restoreRunning && !reuploadRunning && (
              <Button variant="outline" onClick={runReuploadFiles} className="gap-1.5">
                Re-upload images only
              </Button>
            )}
            {(restoreRunning || reuploadRunning) && (
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {restoreMsg}
              </span>
            )}
          </div>
          {restoreArchive?.kind === "race" && (
            <div className="mt-3 rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
              <span className="text-foreground">{restoreArchive.manifest.race.name}</span>
              {" "}({restoreArchive.manifest.race.series.toUpperCase()})
              {" "}· backup from {new Date(restoreArchive.manifest.created_at).toLocaleString()}
              {" "}· {restoreArchive.manifest.counts.sections} sections, {restoreArchive.manifest.counts.images} slots,
              {" "}{restoreArchive.files.length} files
              {restoreArchive.files.length < expectedFileCount(restoreArchive.images) && (
                <div className="mt-1 font-bold text-destructive">
                  Warning: this backup only contains {restoreArchive.files.length} of{" "}
                  {expectedFileCount(restoreArchive.images)} referenced image files — the missing images
                  cannot be restored from this ZIP.
                </div>
              )}
              {restoreExists && (
                <div className="mt-1 font-bold text-[var(--status-todo)]">
                  This race still exists — restoring will replace its current state.
                  If only images are missing, use <span className="text-foreground">Re-upload images only</span> instead.
                </div>
              )}
            </div>
          )}
          {restoreArchive?.kind === "full" && (
            <div className="mt-3 rounded border border-border bg-background/50 p-3 text-xs text-muted-foreground">
              <span className="text-foreground">Full backup</span>
              {" "}· from {new Date(restoreArchive.manifest.created_at).toLocaleString()}
              {" "}· {restoreArchive.manifest.counts.races} races, {restoreArchive.manifest.counts.sections} sections,
              {" "}{restoreArchive.manifest.counts.images} slots, {restoreArchive.files.length} files
              {restoreArchive.files.length < expectedFileCount(restoreArchive.images) && (
                <div className="mt-1 font-bold text-destructive">
                  Warning: this backup only contains {restoreArchive.files.length} of{" "}
                  {expectedFileCount(restoreArchive.images)} referenced image files — the missing images
                  cannot be restored from this ZIP.
                </div>
              )}
              <div className="mt-1">
                {restoreExistingCount > 0 && (
                  <span className="font-bold text-[var(--status-todo)]">
                    {restoreExistingCount} of {restoreArchive.manifest.races.length} races still exist and will be replaced with the backup state.{" "}
                  </span>
                )}
                {restoreArchive.manifest.races.length - restoreExistingCount > 0 && (
                  <span>
                    {restoreArchive.manifest.races.length - restoreExistingCount} deleted race
                    {restoreArchive.manifest.races.length - restoreExistingCount === 1 ? "" : "s"} will be recreated.
                  </span>
                )}
              </div>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Upload a backup ZIP — either a per-race backup (archive button on a race) or the full backup from above.
            Everything comes back exactly as it was: sections, slots, statuses and images included.
            Races that are not in the backup are never touched.
          </p>
        </section>
      </main>
    </div>
  );
}
