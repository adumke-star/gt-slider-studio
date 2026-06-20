## Ziel
Aktuell lädt das Dashboard beim Login **alle** Rennen, **alle** Sections und **alle** Bilder auf einmal. Bei wachsender Datenbank wird das langsam. Künftig soll nur das ausgewählte Rennen vollständig geladen werden — alles andere bleibt minimal.

## Vorgeschlagene Lösung

### 1. Beim Login nur das Nötigste laden
- **Rennen-Liste** (`races`): weiter komplett laden — sehr leichtgewichtig, wird für die Navigation gebraucht.
- **Sections** und **Bilder**: NICHT mehr global laden.
- **Status-Aggregat pro Rennen** (für die orangen/gelben Punkte in der Nav): eine schlanke Abfrage, die pro Rennen nur zwei Booleans liefert:
  - `has_changes` — gibt es mindestens ein Bild mit `status = 'changes'`?
  - `has_open_comments` — gibt es mindestens einen unresolved Comment?

  Umgesetzt als Postgres-View oder RPC `race_status_flags()`, die für alle Rennen je eine Zeile mit `{ race_id, has_changes, has_open_comments }` zurückgibt. Damit bleibt die Navigation aussagekräftig, ohne dass Bilder ins Frontend müssen.

### 2. Beim Auswählen eines Rennens vollständig laden
- Sobald `selection.kind === "race"` (oder `"series"` mit nur einem sichtbaren Rennen), werden für **genau diese Rennen-IDs** geladen:
  - `slider_sections` (where `race_id IN (...)`)
  - `slider_images` (where `race_id IN (...)`)
- Reload und Realtime werden ebenfalls nur für die geladenen Rennen registriert.

### 3. „Serien-Auswahl" (mehrere Rennen)
Da du oben in der Nav eine Serie auswählen kannst (z. B. „Alle F1 Rennen"), wäre das wieder viele Bilder auf einmal. Zwei Optionen:
- **(a) Empfohlen:** Wenn eine Serie ausgewählt ist, im Hauptbereich nur die **Liste der Rennen-Titel** als anklickbare Karten anzeigen (mit Status-Punkten), aber noch keine Bilder. Erst beim Klick auf ein Rennen werden Sections + Bilder geladen.
- **(b) Alternativ:** Alle Rennen der Serie vollständig laden wie heute (kann träge werden, sobald eine Serie viele Rennen hat).

### 4. Cache / UX
- Geladene Rennen werden im State gecached, damit ein Wechsel zwischen zwei kürzlich angesehenen Rennen sofort ist.
- Beim Wechsel wird kurz ein schlanker Loading-Indikator im Hauptbereich gezeigt (nicht der ganze Screen).
- Realtime-Subscription auf `slider_images` / `comments` läuft nur für aktuell geladene Rennen + global für die Status-Flags der Nav.

## Technische Details
- **Neue Postgres-Function/View** `public.race_status_flags()` (SECURITY DEFINER, RLS-konform):
  liefert `(race_id uuid, has_changes bool, has_open_comments bool)` für alle Rennen, die der eingeloggte User sehen darf.
- **`src/routes/_authenticated/index.tsx`**:
  - `images`/`sections` global entfernt; stattdessen pro selektiertem Rennen geladen in einem Map-Cache `{ [raceId]: { sections, images } }`.
  - `load()` -> aufgeteilt in `loadRaces()`, `loadStatusFlags()`, `loadRace(raceId)`.
  - Realtime-Subscription auf `slider_images` und `comments` triggert `loadStatusFlags()` (Nav-Punkte) und `loadRace(raceId)` (aktive Karte).
- **`RaceNav`**: bekommt nicht mehr `images`, sondern eine `Map<raceId, { hasChanges, hasOpenComments }>` aus dem neuen Aggregat — gleiche UI, weniger Daten.
- **`RaceCard`**: unverändert; bekommt weiterhin `sections` + `images`, jetzt eben nur für sein eigenes Rennen.
- Bei Serien-Auswahl (Option a oben): neue kleine `RaceListView`-Komponente, die nur Titel + Status-Punkte zeigt.

## Offen
Welche Variante für die Serien-Auswahl willst du:
- **(a)** Serie zeigt nur eine Übersichts-Liste der Rennen, Bilder erst nach Klick (am schnellsten, am skalierbarsten),
- **(b)** Serie lädt weiterhin alle Rennen voll (wie heute, kann langsam werden)?
