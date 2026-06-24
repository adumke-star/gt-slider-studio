# Backup

Local backup for GT Slider Studio: saves all compressed images in a readable folder
structure plus the database as JSON, so the app can be restored after a Supabase outage
or accidental data loss.

## Prerequisite: service-role key

The storage buckets (`originals`, `compressed`) are private, so the backup needs the
**service-role** key. Add it to your `.env` (which is gitignored):

```
SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>"
```

Get the key from: Supabase Dashboard → Project Settings → API → `service_role` secret.

> Keep this key secret — it bypasses all row-level security. Never commit it.

## Run

```bash
npm run backup
```

This creates a timestamped folder under `backups/` (gitignored).

## What gets backed up

```
backups/2026-06-24_11-30-00/
  database/                     # one JSON array per table
    races.json
    slider_sections.json
    slider_images.json
    comments.json
    comment_mentions.json
    user_roles.json
    allowed_emails.json
    profiles.json
    image_audit_log.json
  files/                        # compressed images, readable layout
    F1/
      Monaco GP/
        PLP Slider 1/
          my-image-name.webp
        PDP Slider 1/
          ...
  manifest.json                 # summary + readable-path -> storage-path mapping
```

- **Images:** only the *compressed* (web) images are saved. The originals are already
  preserved as Drive links inside each section, so they are intentionally skipped.
- **Database:** every public table is exported as JSON, including section names, Drive
  links, statuses, comments and user roles.

## Restore

`npm run restore` re-imports a backup. It restores the core content and access:

- `races` -> `slider_sections` -> `slider_images` (foreign-key-safe order)
- `allowed_emails` (with `invited_by` nulled)
- all compressed images back into the `compressed` storage bucket

It intentionally skips `comments`, `comment_mentions`, `image_audit_log`, `profiles`
and `user_roles` because they reference `auth.users`, which won't exist on a fresh
project. Team members simply sign in again at `/auth`; their roles are recreated from
`allowed_emails` via the `handle_new_user` trigger.

### Prerequisites

1. Schema must exist on the target project: `npx supabase db push`
2. `SUPABASE_SERVICE_ROLE_KEY` available (in `.env` or inline)

### Steps

```bash
# 1. Preview (dry-run, writes nothing) — uses the latest backup folder
npm run restore

# 2. Apply
npm run restore -- --confirm

# Restore a specific backup folder:
npm run restore -- backups/2026-06-24_11-52-58 --confirm
```

- Without `--confirm` it only prints what would happen.
- With `--confirm` it upserts by `id` (updates existing rows instead of duplicating).
- If the target `SUPABASE_URL` differs from the backup's project, it prints a notice.

## Not included (possible later)

- Original source files (covered by Drive links)
- Automated/offsite backups (e.g. scheduled GitHub Action)
- `auth.users` (team members can simply sign up again)
- Restoring comments / audit log / roles (auth-dependent)
