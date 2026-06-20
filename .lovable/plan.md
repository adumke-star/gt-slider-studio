## Ziel
Speicherplatz minimieren: Bilder werden bereits beim Upload verkleinert, nach der Komprimierung wird die Originaldatei automatisch gelöscht, und beim Entfernen eines Bildes werden alle zugehörigen Dateien aus dem Speicher entfernt.

## Änderungen

### 1. Resize direkt beim Upload (Browser-seitig)
Bevor die Datei in den `originals`-Bucket hochgeladen wird, wird sie im Browser über ein `<canvas>` verkleinert:
- Maximale Kantenlänge: **2000px** (lange Seite), Seitenverhältnis bleibt erhalten
- Format: JPEG, Qualität 0.92 (gut genug als „Master" für späteres Re-Compress)
- Dadurch wird z. B. ein 24 MP Foto (~8 MB) auf typischerweise ~500 KB–1 MB reduziert, bleibt aber hochwertig genug, falls man später neu komprimieren / zuschneiden will

Vorteil gegenüber „nur komprimiert hochladen": Du behältst kurz eine etwas größere Version, solange du im Tool an dem Bild arbeitest (Crop, neue Export-Größe usw.), ohne dass es riesig ist.

### 2. Original nach erfolgreicher Komprimierung löschen
Nach erfolgreichem Export in den `compressed`-Bucket (`ExportDialog`):
- Datei aus `originals`-Bucket entfernen
- `slider_images.original_path` auf `NULL` setzen
- In der UI wird ohnehin schon die komprimierte Version bevorzugt angezeigt → kein sichtbarer Unterschied

Ergebnis: pro Bild bleibt nur **eine** kleine Datei (~30–80 KB) übrig.

### 3. Beim Löschen aus dem Tool: Storage mit aufräumen
Aktuell macht `handleRemove` in `RaceCard.tsx` das bereits — wird überprüft und sichergestellt, dass:
- `originals/<path>` gelöscht wird (falls noch vorhanden)
- `compressed/<path>` gelöscht wird
- DB-Zeile in `slider_images` gelöscht wird
- Bei Fehlern (z. B. Datei schon weg) wird trotzdem weitergeräumt, damit keine Karteileichen entstehen

### 4. Bestehende Altlasten (optional)
Einmaliger „Cleanup"-Button (Admin) der für alle Bilder mit vorhandenem `compressed_path` das `original_path` löscht und auf NULL setzt. Sag mir, ob du das willst, sonst lasse ich es weg.

## Technische Details
- Resize-Helper: neue Datei `src/lib/imageResize.ts` mit `resizeImageFile(file, maxDimension=2000, quality=0.92): Promise<File>`
- Aufrufstelle: `ImageCell.tsx` / `RaceCard.tsx` (wo `supabase.storage.from('originals').upload(...)` passiert) — Datei wird vor dem Upload durch den Resizer geschickt
- `ExportDialog.tsx`: nach erfolgreichem Upload in `compressed` → `supabase.storage.from('originals').remove([path])` + `update({ original_path: null })`
- `RaceCard.handleRemove`: defensive Löschung beider Buckets in `Promise.allSettled`

## Trade-off, den du absegnen solltest
Wenn das Original nach dem Komprimieren weg ist und du später **eine andere Export-Größe / neuen Crop** willst, basiert das auf der 2000px-Resize-Version, nicht auf der echten Kameradatei. Für ein Slider-Tool mit Zielgröße 633×382 ist das absolut unkritisch — wollte es nur erwähnt haben.

Soll ich so umsetzen? Und: Cleanup-Button für Altbestände — ja oder nein?
