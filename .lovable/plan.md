## Ziel

E-Mail/Passwort-Anmeldung im Backend aktivieren, **ohne** dass neue Nutzer eine Bestätigungs-E-Mail erhalten. Neue Accounts sind sofort einsatzbereit.

## Was zu tun ist

1. **E-Mail-Provider im Backend aktivieren**
   Aktuell wirft das Backend `email_provider_disabled` (siehe Auth-Logs). Diese Einstellung kann ich aus dem Code nicht umlegen — du musst sie einmalig im Backend-Dashboard einschalten:
   - "View Backend" → Auth-Einstellungen → **Email Provider aktivieren**
   Sobald das aktiv ist, übernehme ich den Rest automatisch.

2. **Auto-Confirm aktivieren (keine Bestätigungsmail)**
   Ich setze über das Auth-Config-Tool:
   - `auto_confirm_email: true` → Nutzer ist sofort eingeloggt, keine Bestätigungs-E-Mail
   - `disable_signup: false` → Registrierung erlaubt
   - `password_hibp_enabled: true` → Schutz gegen geleakte Passwörter (empfohlen, kein Mehraufwand)

3. **Login-Seite erweitern**
   Aktuell zeigt `src/routes/auth.tsx` nur den Google-Button. Ich ergänze:
   - Tabs / Umschalter: **Anmelden** ↔ **Registrieren**
   - E-Mail + Passwort Felder mit Validierung
   - Buttons "Anmelden" (`signInWithPassword`) und "Konto erstellen" (`signUp`)
   - Fehlerbehandlung inkl. der bestehenden Allowlist-Meldung
     (`handle_new_user` blockt nicht-freigeschaltete E-Mails weiterhin per Exception — funktioniert automatisch mit, da der Trigger bei jedem Signup läuft)
   - Google-Button bleibt oben als Hauptoption, E-Mail darunter mit Trenner

## Bewusst nicht enthalten

- **Kein "Passwort vergessen"-Flow** (separate Seite, kannst du später nachfordern)
- **Keine eigene Bestätigungs-E-Mail-Vorlage** — entfällt, da Auto-Confirm an ist
- **Keine Änderung an der Allowlist-Logik** — bleibt wie sie ist

## Technische Details

- `src/routes/auth.tsx`: neue State-Variablen (`mode`, `email`, `password`), Form-Handler, UI mit shadcn `Tabs`, `Input`, `Label`
- `supabase--configure_auth` Aufruf mit den oben genannten Flags
- Keine DB-Migrationen nötig — Profiles/Roles werden bereits durch den `handle_new_user`-Trigger korrekt angelegt

## Was du tun musst, bevor ich starten kann

Bitte den E-Mail-Provider im Backend einmal manuell aktivieren (Schritt 1). Danach klick auf "Implement plan" und ich erledige Schritt 2 und 3.
