# Plan: Kommentar- & Feedback-Funktion pro Bild

## Ziel
Mitarbeiter können pro Bild-Slot einen Kommentar-Thread führen, andere Mitarbeiter mit `@name` markieren, und die markierte Person bekommt automatisch eine Benachrichtigung per **Google Chat** (Space-Webhook) und **E-Mail**.

Umsetzbar — kein Hexenwerk. Aufwand ist überschaubar, weil wir Lovable Cloud (Auth, DB, RLS) + zwei einfache externe Integrationen nutzen.

---

## 1. Login & Nutzerverwaltung (Voraussetzung)

- **Google Sign-In** als einziger Login-Weg (passt zu eurem Workspace, liefert Name + E-Mail automatisch für Mentions).
- **Allowlist**: nur freigegebene User dürfen rein. Umsetzung:
  - Tabelle `allowed_emails` (vom Admin gepflegt) ODER Domain-Check (`@eurefirma.com`).
  - Trigger beim Signup: ist die E-Mail nicht erlaubt → Account wird sofort gelöscht / blockiert.
- `profiles`-Tabelle mit `id, email, full_name, avatar_url` (auto-befüllt beim ersten Login).
- `user_roles`-Tabelle (`admin` / `member`) — nur Admins können die Allowlist pflegen.
- Auth-Routen: `/auth` (Login), alles bisherige wandert unter `_authenticated`.

## 2. Datenmodell (neu)

- `comments`
  - `id, image_id (→ slider_images), author_id (→ profiles), body (text), created_at, updated_at`
- `comment_mentions`
  - `id, comment_id, mentioned_user_id, notified_at, read_at`
- RLS: nur eingeloggte User dürfen lesen/schreiben; nur Autor darf editieren/löschen.

## 3. UI

- **Kommentar-Button** in jedem `ImageCell` (kleines Sprechblasen-Icon mit Badge = Anzahl ungelesener Kommentare/Mentions).
- Klick öffnet **Sheet/Drawer rechts** mit:
  - Bild-Preview oben (damit klar ist worum es geht)
  - Chronologischer Thread (Avatar, Name, Zeit, Text)
  - Eingabefeld unten mit `@`-Autocomplete (Liste aller `profiles`)
  - Mentions werden im Text als Chip `@Max Mustermann` gerendert
- **Globale Glocke** oben rechts: zeigt alle Threads in denen ich erwähnt wurde, mit Link zum Bild.

## 4. Benachrichtigungen

Beim Speichern eines Kommentars → Server Function `postComment`:
1. Kommentar + Mentions in DB schreiben
2. Für jede gementionte Person parallel:
   - **Google Chat**: POST an Webhook-URL eines gemeinsamen Spaces. Karte mit „<Autor> hat dich zu <Race> / <Section> / Slot #<n> markiert" + Kommentartext + Link zur App.
   - **E-Mail** (über Lovable Emails / euer Email-Domain-Setup): gleicher Inhalt, „Antworten" führt zurück in die App.
3. `notified_at` setzen.

Beides ist **Best-Effort** — wenn Chat oder Mail fehlschlägt, wird der Kommentar trotzdem gespeichert und der Fehler geloggt.

## 5. Was wir vom dir brauchen
1. **Erlaubte Domain oder Liste der E-Mails** für die Allowlist.
2. **Google-Chat-Webhook-URL** des Spaces, in den die Benachrichtigungen sollen. (In Google Chat: Space → „Apps & Integrationen" → „Webhooks verwalten" → URL kopieren). Wir speichern sie als Secret `GOOGLE_CHAT_WEBHOOK_URL`.
3. **Sender-Domain für E-Mails** (z. B. `notify.eurefirma.com`) — wird einmalig per Lovable-Setup verifiziert.

## 6. Reihenfolge der Umsetzung

```text
Schritt 1  Google-Login + profiles + Allowlist + _authenticated-Layout
Schritt 2  user_roles + Admin-Seite für Allowlist
Schritt 3  comments + comment_mentions Tabellen mit RLS
Schritt 4  Kommentar-Sheet im ImageCell + @mention-Autocomplete
Schritt 5  Glocke / In-App-Benachrichtigungen
Schritt 6  Google-Chat-Webhook-Integration (Server Function)
Schritt 7  E-Mail-Benachrichtigung (Lovable Emails)
```

Wir können nach Schritt 4 schon live testen — Benachrichtigungen kommen on top.

## Technische Hinweise
- Auth: Supabase Google OAuth via Lovable Cloud, gated über das `_authenticated`-Layout der Integration.
- Mention-Parsing: Markdown-ähnliches Format `@[Name](user_id)` im DB-Text, beim Rendern in Chips umgewandelt — robuster als reines `@name`.
- Server Function `postComment` mit `requireSupabaseAuth` — verhindert anonymes Spamming des Chat-Webhooks.
- Google-Chat-Webhooks brauchen **kein** OAuth, nur die URL → einfach.
- Realtime (Supabase Channels) optional in Phase 2, damit Kommentare live auftauchen ohne Reload.
