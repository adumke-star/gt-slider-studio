## Problem

Der Export funktioniert technisch — er komprimiert die Bilder per Canvas und legt sie im `compressed`-Bucket ab (deshalb erscheint im Bild auch der „komprimiert"-Status). Es fehlt aber das, was du erwartest: ein **Speicherort-Dialog / Download auf deinen Rechner**. Aktuell landen die Web-Ready-Dateien nur in der Cloud, nicht auf der Festplatte.

## Lösung

Den Export-Flow um lokale Downloads ergänzen, ohne die DB-/Bucket-Logik zu verändern.

### 1. `ExportDialog.tsx` erweitern
- Neue Option **„Download nach Export"** (Toggle, default an) mit zwei Modi:
  - **Einzeldateien** — je komprimiertes Bild wird per `a[download]` ausgelöst.
  - **ZIP** — alle Bilder eines Exports werden in ein ZIP gepackt (`<RaceName>_<Area>.zip`) und einmal heruntergeladen. Default für >1 Bild.
- Dateinamen-Schema: `{race-slug}_{area}_{position}.{ext}` (z. B. `monaco-gp_plp_1.webp`).
- Nach dem Upload in Supabase wird das `blob` im RAM gehalten und am Ende für Download verwendet — keine zweite Komprimierung nötig.

### 2. Einzel-Download pro Zelle
- In `ImageCell.tsx` einen kleinen Download-Button (Icon) einblenden, sobald `compressed_path` existiert — lädt die komprimierte Datei via signed URL und triggert `a[download]`.

### 3. Mini-Bibliothek für ZIP
- `jszip` hinzufügen (rein clientseitig, klein, keine Server-Abhängigkeit).

### 4. Feedback
- Toast nach Abschluss: „X Bilder exportiert · ZIP heruntergeladen" bzw. „… in Cloud gespeichert".
- Progress-Anzeige bleibt wie sie ist.

## Was bleibt unverändert
- Supabase-Schema, Buckets, RLS.
- Canvas-Transformation (633×382, Format/KB-Slider).
- Trennung Originals ↔ Compressed.

## Technische Details
- Neue Dependency: `jszip`.
- Geänderte Dateien: `src/components/dashboard/ExportDialog.tsx`, `src/components/dashboard/ImageCell.tsx`.
- Browser-`a[download]` reicht — kein File System Access API nötig (Chrome/Edge zeigen den Speicherort-Dialog ohnehin, wenn „Vor dem Download fragen" in den Browser-Einstellungen aktiv ist).
