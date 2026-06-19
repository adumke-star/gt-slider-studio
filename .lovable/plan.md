# Plan: Dashboard-Erweiterungen

## 1. Harte Größenobergrenze beim Export
- `src/lib/imageProcess.ts`: Qualitätssuche so anpassen, dass das Ergebnis **immer ≤ targetKB** ist. Binäre Suche wird konservativ (zu groß → härter runter), Endkontrolle: falls noch zu groß, schrittweise weiter runter bis 0.2.
- Wenn auch bei minimaler Qualität noch zu groß: Bildgröße iterativ um 10 % verkleinern (633×382 bleibt obere Grenze) bis Limit eingehalten oder Mindestgröße erreicht. Tritt das ein, Hinweis im Toast: „Limit eingehalten, Auflösung reduziert".
- PNG: bleibt verlustfrei; wenn PNG > targetKB, automatisch Hinweis „PNG kann nicht garantiert werden".

## 2. Namensfeld pro Bild
- `slider_images.title` existiert bereits — als Anzeigename verwenden.
- `ImageCell.tsx`: kleines, inline editierbares Textfeld unterhalb der Buttons (Klick zum Bearbeiten, Speichern bei Blur/Enter).
- Download-Dateinamen (Einzel-Download in `ImageCell` und Export in `ExportDialog`) nutzen `slugify(title)` falls gesetzt, sonst Fallback aus Race-Name + Section + Position.

## 3. Drag & Drop Umsortieren
- Aktuelles Verhalten tauscht nur zwei Bilder. Neu: **Einsortieren an Zielposition** (klassisches Reorder).
- `ImageCell` bekommt zusätzlich linke/rechte Drop-Indikatoren; beim Drop wird das gezogene Bild vor/nach dem Ziel eingefügt, alle `position`-Werte der betroffenen Section neu gesetzt (Batch-Update).
- Drag bleibt innerhalb derselben Section (Cross-Section später).

## 4. Mehrere benannte PLP/PDP-Sections
Aktuell ist `area` ein Enum (`plp` | `pdp`) — fest verdrahtet. Wir führen eine richtige Section-Tabelle ein:

**Schema (Migration):**
- Neue Tabelle `slider_sections`:
  - `race_id` (FK races)
  - `kind` ('plp' | 'pdp')
  - `name` (text, editierbar, z. B. „PLP Hero", „PDP Sidebar")
  - `sort_order` (int)
  - `external_url` (text, nullable) — siehe Punkt 5
- `slider_images`: neue Spalte `section_id uuid` (FK), bestehende Zeilen werden über `area` auf je eine automatisch erzeugte Default-Section pro Race + Kind gemappt. `area` bleibt vorerst bestehen (nullable) zur Sicherheit.
- GRANTs + RLS analog zu bestehenden Tabellen.

**UI:**
- `RaceCard.tsx`: rendert Liste der Sections statt fixen PLP/PDP-Block. Pro Section:
  - Editierbarer Name (Inline)
  - Kind-Badge (PLP/PDP)
  - „+ Slot", Section löschen, Section umbenennen
- Oben in der Race-Card: Button „+ PLP-Section" und „+ PDP-Section".

## 5. Externer Link pro Section (Original-Ordner)
- Feld `external_url` in `slider_sections` (siehe 4).
- Im Section-Header: kleines Stift-Icon zum Eintragen/Ändern der URL (Prompt oder Inline-Input).
- Wenn URL gesetzt: Button **„Originale öffnen"** (Icon `ExternalLink`) im Header — öffnet die URL in neuem Tab (`target="_blank" rel="noopener"`). Kein roher Link sichtbar.

## Technische Notizen
- Migration in einem Schritt: Tabelle anlegen, GRANTs, RLS, Policies, dann Default-Sections für jedes bestehende Race per `INSERT … SELECT` aus `races` (eine „PLP" + eine „PDP" pro Race) und `UPDATE slider_images SET section_id = …` über das Mapping (race_id, area).
- `ExportDialog` Dateinamen-Logik nutzt neuen Titel; Section-Name geht statt `area` in den Fallback-Namen ein.
- `types.ts` regeneriert sich nach der Migration; danach folgen die Code-Anpassungen.

## Reihenfolge der Umsetzung
1. Migration (Sections-Tabelle, Backfill).
2. Code-Refactor `RaceCard` + `ImageCell` (Sections, Namen, Reorder, Link-Button).
3. `imageProcess.ts` harte Obergrenze.
4. Export-/Download-Dateinamen anpassen.
